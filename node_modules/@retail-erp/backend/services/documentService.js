const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

// Document types
const DOCUMENT_TYPES = {
  SALES_RECEIPT: 'sales_receipt',
  RETURN_RECEIPT: 'return_receipt',
  EXCHANGE_RECEIPT: 'exchange_receipt',
  VOID_RECEIPT: 'void_receipt',
  GRN_PROOF: 'grn_proof',
  TRANSFER_NOTE: 'transfer_note'
};

// Format types
const FORMAT_TYPES = {
  THERMAL: 'thermal', // 80mm thermal printer
  A4: 'a4'            // Standard A4
};

// Helper to format currency
function formatCurrency(amount, currency = 'EGP') {
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount || 0);
}

// Helper to format date
function formatDate(date, includeTime = true) {
  const d = new Date(date);
  const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (!includeTime) return dateStr;
  const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} ${timeStr}`;
}

// Generate QR Code as data URL
async function generateQRCode(data) {
  try {
    return await QRCode.toDataURL(data, { width: 100, margin: 1 });
  } catch (err) {
    console.error('QR Code generation failed:', err);
    return null;
  }
}

// ============================================
// SALES RECEIPT PDF GENERATOR
// ============================================
async function generateSalesReceipt(data, format = FORMAT_TYPES.THERMAL, options = {}) {
  const { 
    store, receipt, items, payments, customer, cashier, tenant,
    isReprint = false, isVoid = false
  } = data;
  
  const currency = tenant?.currency_code || 'EGP';
  const isThermal = format === FORMAT_TYPES.THERMAL;
  
  // Page setup
  const pageWidth = isThermal ? 226 : 595; // 80mm ≈ 226pt, A4 = 595pt
  const pageHeight = isThermal ? 'auto' : 842;
  const margin = isThermal ? 10 : 50;
  const contentWidth = pageWidth - (margin * 2);
  
  const doc = new PDFDocument({
    size: isThermal ? [pageWidth, 800] : 'A4',
    margin: margin,
    bufferPages: true
  });
  
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  
  let y = margin;
  
  // Helper functions
  const centerText = (text, fontSize = 10) => {
    doc.fontSize(fontSize);
    const textWidth = doc.widthOfString(text);
    doc.text(text, (pageWidth - textWidth) / 2, y);
    y += fontSize + 4;
  };
  
  const leftRightText = (left, right, fontSize = 9) => {
    doc.fontSize(fontSize);
    doc.text(left, margin, y);
    const rightWidth = doc.widthOfString(right);
    doc.text(right, pageWidth - margin - rightWidth, y);
    y += fontSize + 3;
  };
  
  const drawLine = (thickness = 0.5) => {
    y += 3;
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(thickness).stroke();
    y += 5;
  };
  
  const drawDashedLine = () => {
    y += 3;
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).dash(3, { space: 2 }).stroke().undash();
    y += 5;
  };
  
  // ---- HEADER ----
  doc.font('Helvetica-Bold');
  centerText(store?.name || 'Store', isThermal ? 14 : 18);
  
  doc.font('Helvetica');
  if (store?.address) {
    centerText(store.address, isThermal ? 8 : 10);
  }
  if (store?.phone) {
    centerText(`Tel: ${store.phone}`, isThermal ? 8 : 10);
  }
  
  y += 5;
  drawLine();
  
  // Receipt Type Title
  doc.font('Helvetica-Bold');
  let receiptTitle = 'SALES RECEIPT';
  if (receipt.type === 'return' || isVoid) {
    receiptTitle = isVoid ? 'VOID RECEIPT' : 'RETURN RECEIPT';
  } else if (receipt.type === 'exchange') {
    receiptTitle = 'EXCHANGE RECEIPT';
  }
  centerText(receiptTitle, isThermal ? 12 : 16);
  
  // Watermarks
  if (isReprint) {
    doc.fillColor('#888888');
    centerText('** REPRINT **', isThermal ? 10 : 12);
    doc.fillColor('#000000');
  }
  if (isVoid) {
    doc.fillColor('#cc0000');
    centerText('** VOIDED **', isThermal ? 10 : 12);
    doc.fillColor('#000000');
  }
  
  drawLine();
  
  // ---- RECEIPT INFO ----
  doc.font('Helvetica');
  leftRightText('Receipt #:', receipt.receipt_number || '-', isThermal ? 9 : 10);
  leftRightText('Date:', formatDate(receipt.receipt_date || new Date()), isThermal ? 9 : 10);
  leftRightText('Cashier:', cashier?.name || receipt.cashier_name || '-', isThermal ? 9 : 10);
  
  if (customer) {
    leftRightText('Customer:', `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || '-', isThermal ? 9 : 10);
    if (customer.phone) {
      leftRightText('Phone:', customer.phone, isThermal ? 9 : 10);
    }
  }
  
  drawDashedLine();
  
  // ---- LINE ITEMS ----
  doc.font('Helvetica-Bold');
  if (isThermal) {
    doc.fontSize(8);
    doc.text('Item', margin, y);
    doc.text('Qty', margin + 100, y);
    doc.text('Price', margin + 130, y);
    doc.text('Total', pageWidth - margin - 40, y);
  } else {
    doc.fontSize(10);
    doc.text('Item', margin, y);
    doc.text('SKU', margin + 200, y);
    doc.text('Qty', margin + 280, y);
    doc.text('Price', margin + 340, y);
    doc.text('Total', margin + 420, y);
  }
  y += 12;
  drawDashedLine();
  
  doc.font('Helvetica');
  const fontSize = isThermal ? 8 : 9;
  
  for (const item of items) {
    if (isThermal) {
      // Thermal: compact layout
      const itemName = item.name?.substring(0, 18) || 'Item';
      doc.fontSize(fontSize);
      doc.text(itemName, margin, y);
      doc.text(item.quantity?.toString() || '1', margin + 100, y);
      doc.text(formatCurrency(item.unit_price, currency).replace(currency, ''), margin + 125, y);
      doc.text(formatCurrency(item.line_total, currency).replace(currency, ''), pageWidth - margin - 45, y);
      y += fontSize + 4;
      
      // Show discount if any
      if (item.discount_amount && item.discount_amount > 0) {
        doc.fontSize(7);
        doc.text(`  Discount: -${formatCurrency(item.discount_amount, currency)}`, margin, y);
        y += 10;
      }
    } else {
      // A4: full layout
      doc.fontSize(fontSize);
      doc.text(item.name || 'Item', margin, y, { width: 190 });
      doc.text(item.sku || '-', margin + 200, y);
      doc.text(item.quantity?.toString() || '1', margin + 280, y);
      doc.text(formatCurrency(item.unit_price, currency), margin + 330, y);
      doc.text(formatCurrency(item.line_total, currency), margin + 420, y);
      y += fontSize + 6;
      
      if (item.discount_amount && item.discount_amount > 0) {
        doc.fontSize(8);
        doc.fillColor('#666666');
        doc.text(`  Discount: -${formatCurrency(item.discount_amount, currency)}`, margin + 20, y);
        doc.fillColor('#000000');
        y += 12;
      }
    }
  }
  
  drawDashedLine();
  
  // ---- TOTALS ----
  doc.font('Helvetica');
  const totalsSize = isThermal ? 9 : 10;
  
  leftRightText('Subtotal:', formatCurrency(receipt.subtotal, currency), totalsSize);
  
  if (receipt.discount_amount && receipt.discount_amount > 0) {
    leftRightText('Discount:', `-${formatCurrency(receipt.discount_amount, currency)}`, totalsSize);
  }
  
  if (receipt.tax_amount && receipt.tax_amount > 0) {
    leftRightText('Tax/VAT:', formatCurrency(receipt.tax_amount, currency), totalsSize);
  }
  
  drawLine(1);
  
  doc.font('Helvetica-Bold');
  leftRightText('TOTAL:', formatCurrency(receipt.total_amount, currency), isThermal ? 12 : 14);
  
  drawLine(1);
  
  // ---- PAYMENT INFO ----
  doc.font('Helvetica');
  y += 3;
  
  if (payments && payments.length > 0) {
    for (const payment of payments) {
      const method = (payment.method || 'cash').toUpperCase();
      leftRightText(`Paid (${method}):`, formatCurrency(payment.amount, currency), totalsSize);
      if (payment.reference) {
        leftRightText('  Ref:', payment.reference, isThermal ? 7 : 8);
      }
    }
  } else {
    leftRightText('Paid:', formatCurrency(receipt.paid_amount || receipt.total_amount, currency), totalsSize);
  }
  
  if (receipt.change_amount && receipt.change_amount > 0) {
    leftRightText('Change:', formatCurrency(receipt.change_amount, currency), totalsSize);
  }
  
  drawDashedLine();
  
  // ---- FOOTER ----
  y += 5;
  doc.font('Helvetica');
  const footerSize = isThermal ? 7 : 8;
  
  // Return policy
  const returnPolicy = tenant?.settings?.receipt_footer || 'Thank you for shopping with us!';
  doc.fontSize(footerSize);
  const policyLines = doc.heightOfString(returnPolicy, { width: contentWidth });
  doc.text(returnPolicy, margin, y, { width: contentWidth, align: 'center' });
  y += policyLines + 10;
  
  // QR Code
  try {
    const qrData = JSON.stringify({
      r: receipt.receipt_number,
      s: store?.id,
      t: new Date(receipt.receipt_date).getTime()
    });
    const qrDataUrl = await generateQRCode(qrData);
    if (qrDataUrl) {
      const qrSize = isThermal ? 60 : 80;
      const qrX = (pageWidth - qrSize) / 2;
      doc.image(qrDataUrl, qrX, y, { width: qrSize, height: qrSize });
      y += qrSize + 5;
    }
  } catch (err) {
    console.error('QR generation failed:', err);
  }
  
  // Thank you
  centerText('Thank you for your business!', footerSize);
  y += 10;
  
  // Timestamp
  doc.fontSize(6);
  centerText(`Generated: ${formatDate(new Date())}`, 6);
  
  doc.end();
  
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// ============================================
// GRN / RECEIVING PROOF PDF GENERATOR
// ============================================
async function generateGRNProof(data, format = FORMAT_TYPES.A4) {
  const { grn, items, supplier, store, user, tenant } = data;
  const currency = tenant?.currency_code || 'EGP';
  const isThermal = format === FORMAT_TYPES.THERMAL;
  
  const pageWidth = isThermal ? 226 : 595;
  const margin = isThermal ? 10 : 50;
  const contentWidth = pageWidth - (margin * 2);
  
  const doc = new PDFDocument({
    size: isThermal ? [pageWidth, 1000] : 'A4',
    margin: margin,
    bufferPages: true
  });
  
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  
  let y = margin;
  
  // Helper functions
  const centerText = (text, fontSize = 10) => {
    doc.fontSize(fontSize);
    const textWidth = doc.widthOfString(text);
    doc.text(text, (pageWidth - textWidth) / 2, y);
    y += fontSize + 4;
  };
  
  const leftRightText = (left, right, fontSize = 9) => {
    doc.fontSize(fontSize);
    doc.text(left, margin, y);
    const rightWidth = doc.widthOfString(right);
    doc.text(right, pageWidth - margin - rightWidth, y);
    y += fontSize + 3;
  };
  
  const drawLine = (thickness = 0.5) => {
    y += 3;
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(thickness).stroke();
    y += 5;
  };
  
  // ---- HEADER ----
  doc.font('Helvetica-Bold');
  centerText(store?.name || tenant?.name || 'Company', 16);
  
  doc.font('Helvetica');
  if (store?.address) centerText(store.address, 9);
  
  y += 10;
  doc.font('Helvetica-Bold');
  centerText('GOODS RECEIVED NOTE', 14);
  drawLine(1);
  
  // ---- GRN INFO ----
  doc.font('Helvetica');
  leftRightText('GRN Number:', grn.grn_number || '-', 10);
  leftRightText('Date:', formatDate(grn.grn_date || grn.received_at || new Date()), 10);
  leftRightText('Status:', (grn.status || 'received').toUpperCase(), 10);
  
  y += 5;
  drawLine();
  
  // ---- SUPPLIER INFO ----
  doc.font('Helvetica-Bold');
  doc.fontSize(10);
  doc.text('Supplier Information', margin, y);
  y += 14;
  
  doc.font('Helvetica');
  leftRightText('Name:', supplier?.name || '-', 9);
  leftRightText('Code:', supplier?.code || '-', 9);
  if (supplier?.phone) leftRightText('Phone:', supplier.phone, 9);
  if (grn.reference_number) leftRightText('Reference:', grn.reference_number, 9);
  if (grn.purchase_order_id) leftRightText('PO Reference:', grn.purchase_order_id, 9);
  
  drawLine();
  
  // ---- ITEMS TABLE ----
  doc.font('Helvetica-Bold');
  doc.fontSize(9);
  doc.text('SKU', margin, y);
  doc.text('Item', margin + 60, y);
  doc.text('Qty', margin + 280, y);
  doc.text('Unit Cost', margin + 340, y);
  doc.text('Total', margin + 420, y);
  y += 14;
  drawLine();
  
  doc.font('Helvetica');
  let totalQty = 0;
  let totalCost = 0;
  
  for (const item of items) {
    doc.fontSize(8);
    doc.text(item.sku || '-', margin, y, { width: 55 });
    doc.text(item.name || 'Item', margin + 60, y, { width: 210 });
    doc.text(item.quantity?.toString() || '0', margin + 280, y);
    doc.text(formatCurrency(item.unit_cost || item.cost_price, currency), margin + 330, y);
    doc.text(formatCurrency(item.line_total || (item.quantity * (item.unit_cost || 0)), currency), margin + 420, y);
    y += 14;
    
    totalQty += parseFloat(item.quantity) || 0;
    totalCost += parseFloat(item.line_total) || (parseFloat(item.quantity) * parseFloat(item.unit_cost || 0));
  }
  
  drawLine(1);
  
  // ---- TOTALS ----
  doc.font('Helvetica-Bold');
  leftRightText('Total Quantity:', totalQty.toString(), 10);
  leftRightText('Total Cost:', formatCurrency(grn.total_amount || totalCost, currency), 11);
  
  if (grn.tax_amount && grn.tax_amount > 0) {
    leftRightText('Tax:', formatCurrency(grn.tax_amount, currency), 10);
  }
  
  drawLine();
  
  // ---- NOTES ----
  if (grn.notes) {
    doc.font('Helvetica-Bold');
    doc.fontSize(10);
    doc.text('Notes:', margin, y);
    y += 14;
    doc.font('Helvetica');
    doc.fontSize(9);
    doc.text(grn.notes, margin, y, { width: contentWidth });
    y += doc.heightOfString(grn.notes, { width: contentWidth }) + 10;
  }
  
  y += 20;
  drawLine();
  
  // ---- SIGNATURES ----
  doc.font('Helvetica-Bold');
  doc.fontSize(10);
  doc.text('Signatures', margin, y);
  y += 20;
  
  doc.font('Helvetica');
  doc.fontSize(9);
  
  // Received By
  doc.text('Received By:', margin, y);
  doc.text('_______________________', margin, y + 30);
  doc.text(user?.name || grn.received_by_name || '(Name & Signature)', margin, y + 45);
  doc.text(`Date: ${formatDate(grn.received_at || new Date(), false)}`, margin, y + 58);
  
  // Checked By
  doc.text('Checked By:', margin + 170, y);
  doc.text('_______________________', margin + 170, y + 30);
  doc.text('(Name & Signature)', margin + 170, y + 45);
  doc.text('Date: _______________', margin + 170, y + 58);
  
  // Approved By
  doc.text('Approved By:', margin + 340, y);
  doc.text('_______________________', margin + 340, y + 30);
  doc.text('(Name & Signature)', margin + 340, y + 45);
  doc.text('Date: _______________', margin + 340, y + 58);
  
  y += 80;
  
  // Footer
  doc.fontSize(7);
  doc.fillColor('#666666');
  centerText(`Document generated: ${formatDate(new Date())}`, 7);
  
  doc.end();
  
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// ============================================
// TRANSFER NOTE PDF GENERATOR
// ============================================
async function generateTransferNote(data, format = FORMAT_TYPES.A4) {
  const { transfer, items, fromStore, toStore, user, tenant } = data;
  const isThermal = format === FORMAT_TYPES.THERMAL;
  
  const pageWidth = isThermal ? 226 : 595;
  const margin = isThermal ? 10 : 50;
  const contentWidth = pageWidth - (margin * 2);
  
  const doc = new PDFDocument({
    size: isThermal ? [pageWidth, 1000] : 'A4',
    margin: margin,
    bufferPages: true
  });
  
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  
  let y = margin;
  
  // Helper functions
  const centerText = (text, fontSize = 10) => {
    doc.fontSize(fontSize);
    const textWidth = doc.widthOfString(text);
    doc.text(text, (pageWidth - textWidth) / 2, y);
    y += fontSize + 4;
  };
  
  const leftRightText = (left, right, fontSize = 9) => {
    doc.fontSize(fontSize);
    doc.text(left, margin, y);
    const rightWidth = doc.widthOfString(right);
    doc.text(right, pageWidth - margin - rightWidth, y);
    y += fontSize + 3;
  };
  
  const drawLine = (thickness = 0.5) => {
    y += 3;
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(thickness).stroke();
    y += 5;
  };
  
  // ---- HEADER ----
  doc.font('Helvetica-Bold');
  centerText(tenant?.name || 'Company', 16);
  
  y += 10;
  centerText('STOCK TRANSFER NOTE', 14);
  drawLine(1);
  
  // ---- TRANSFER INFO ----
  doc.font('Helvetica');
  leftRightText('Transfer #:', transfer.transfer_number || '-', 10);
  leftRightText('Date:', formatDate(transfer.created_at || new Date()), 10);
  leftRightText('Status:', (transfer.status || 'pending').toUpperCase(), 10);
  
  y += 5;
  drawLine();
  
  // ---- LOCATION INFO ----
  doc.font('Helvetica-Bold');
  doc.fontSize(11);
  
  // From Store
  doc.text('FROM:', margin, y);
  y += 14;
  doc.font('Helvetica');
  doc.fontSize(10);
  doc.text(fromStore?.name || transfer.from_store_name || '-', margin + 20, y);
  if (fromStore?.address) {
    y += 12;
    doc.fontSize(9);
    doc.text(fromStore.address, margin + 20, y);
  }
  y += 20;
  
  // Arrow
  doc.font('Helvetica-Bold');
  doc.fontSize(14);
  centerText('↓', 14);
  y += 5;
  
  // To Store
  doc.font('Helvetica-Bold');
  doc.fontSize(11);
  doc.text('TO:', margin, y);
  y += 14;
  doc.font('Helvetica');
  doc.fontSize(10);
  doc.text(toStore?.name || transfer.to_store_name || '-', margin + 20, y);
  if (toStore?.address) {
    y += 12;
    doc.fontSize(9);
    doc.text(toStore.address, margin + 20, y);
  }
  y += 15;
  
  drawLine();
  
  // ---- STATUS TIMELINE ----
  if (transfer.timeline && transfer.timeline.length > 0) {
    doc.font('Helvetica-Bold');
    doc.fontSize(10);
    doc.text('Status Timeline', margin, y);
    y += 14;
    
    doc.font('Helvetica');
    doc.fontSize(8);
    for (const event of transfer.timeline) {
      doc.text(`• ${event.status}: ${formatDate(event.timestamp)} - ${event.user || 'System'}`, margin + 10, y);
      y += 12;
    }
    y += 5;
    drawLine();
  }
  
  // ---- ITEMS TABLE ----
  doc.font('Helvetica-Bold');
  doc.fontSize(9);
  doc.text('SKU', margin, y);
  doc.text('Item', margin + 60, y);
  doc.text('UoM', margin + 280, y);
  doc.text('Qty Req', margin + 340, y);
  doc.text('Qty Ship', margin + 400, y);
  doc.text('Qty Recv', margin + 450, y);
  y += 14;
  drawLine();
  
  doc.font('Helvetica');
  let totalRequested = 0;
  let totalShipped = 0;
  let totalReceived = 0;
  
  for (const item of items) {
    doc.fontSize(8);
    doc.text(item.sku || '-', margin, y, { width: 55 });
    doc.text(item.name || 'Item', margin + 60, y, { width: 210 });
    doc.text(item.uom || 'EA', margin + 280, y);
    doc.text((item.quantity_requested || item.quantity || 0).toString(), margin + 345, y);
    doc.text((item.quantity_shipped || item.quantity || 0).toString(), margin + 405, y);
    doc.text((item.quantity_received || '-').toString(), margin + 455, y);
    y += 14;
    
    totalRequested += parseFloat(item.quantity_requested || item.quantity) || 0;
    totalShipped += parseFloat(item.quantity_shipped || item.quantity) || 0;
    totalReceived += parseFloat(item.quantity_received) || 0;
  }
  
  drawLine(1);
  
  // ---- TOTALS ----
  doc.font('Helvetica-Bold');
  doc.fontSize(9);
  doc.text('TOTALS:', margin, y);
  doc.text(totalRequested.toString(), margin + 345, y);
  doc.text(totalShipped.toString(), margin + 405, y);
  doc.text(totalReceived > 0 ? totalReceived.toString() : '-', margin + 455, y);
  y += 20;
  
  // ---- NOTES ----
  if (transfer.notes) {
    drawLine();
    doc.font('Helvetica-Bold');
    doc.fontSize(10);
    doc.text('Notes:', margin, y);
    y += 14;
    doc.font('Helvetica');
    doc.fontSize(9);
    doc.text(transfer.notes, margin, y, { width: contentWidth });
    y += doc.heightOfString(transfer.notes, { width: contentWidth }) + 10;
  }
  
  // ---- LOGISTICS INFO ----
  if (transfer.vehicle_plate || transfer.seal_number) {
    y += 10;
    doc.font('Helvetica-Bold');
    doc.fontSize(10);
    doc.text('Logistics Information', margin, y);
    y += 14;
    doc.font('Helvetica');
    doc.fontSize(9);
    if (transfer.vehicle_plate) leftRightText('Vehicle Plate:', transfer.vehicle_plate, 9);
    if (transfer.seal_number) leftRightText('Seal Number:', transfer.seal_number, 9);
  }
  
  y += 20;
  drawLine();
  
  // ---- SIGNATURES ----
  doc.font('Helvetica-Bold');
  doc.fontSize(10);
  doc.text('Signatures', margin, y);
  y += 20;
  
  doc.font('Helvetica');
  doc.fontSize(9);
  
  // Prepared By
  doc.text('Prepared By:', margin, y);
  doc.text('_______________________', margin, y + 30);
  doc.text(user?.name || transfer.created_by_name || '(Name & Signature)', margin, y + 45);
  doc.text(`Date: ${formatDate(transfer.created_at || new Date(), false)}`, margin, y + 58);
  
  // Driver
  doc.text('Driver:', margin + 170, y);
  doc.text('_______________________', margin + 170, y + 30);
  doc.text('(Name & Signature)', margin + 170, y + 45);
  doc.text('Date: _______________', margin + 170, y + 58);
  
  // Received By
  doc.text('Received By:', margin + 340, y);
  doc.text('_______________________', margin + 340, y + 30);
  doc.text('(Name & Signature)', margin + 340, y + 45);
  doc.text('Date: _______________', margin + 340, y + 58);
  
  y += 80;
  
  // Footer
  doc.fontSize(7);
  doc.fillColor('#666666');
  centerText(`Document generated: ${formatDate(new Date())}`, 7);
  
  doc.end();
  
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// ============================================
// MAIN DOCUMENT GENERATOR
// ============================================
async function generateDocument(type, data, format = FORMAT_TYPES.A4, options = {}) {
  switch (type) {
    case DOCUMENT_TYPES.SALES_RECEIPT:
    case DOCUMENT_TYPES.RETURN_RECEIPT:
    case DOCUMENT_TYPES.EXCHANGE_RECEIPT:
      return generateSalesReceipt(data, format, options);
    
    case DOCUMENT_TYPES.VOID_RECEIPT:
      return generateSalesReceipt(data, format, { ...options, isVoid: true });
    
    case DOCUMENT_TYPES.GRN_PROOF:
      return generateGRNProof(data, format);
    
    case DOCUMENT_TYPES.TRANSFER_NOTE:
      return generateTransferNote(data, format);
    
    default:
      throw new Error(`Unknown document type: ${type}`);
  }
}

module.exports = {
  DOCUMENT_TYPES,
  FORMAT_TYPES,
  generateDocument,
  generateSalesReceipt,
  generateGRNProof,
  generateTransferNote
};
