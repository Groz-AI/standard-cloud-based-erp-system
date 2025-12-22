import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const registerSchema = z.object({
  tenantName: z.string().min(2),
  tenantSlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  currencyCode: z.string().length(3).optional(),
  timezone: z.string().optional(),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
  adminFirstName: z.string().min(1),
  adminLastName: z.string().optional(),
  storeName: z.string().min(1),
  storeCode: z.string().optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

const changeEmailSchema = z.object({
  newEmail: z.string().email(),
  password: z.string().min(1)
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await AuthService.login(body.email, body.password);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    res.status(401).json({
      success: false,
      error: { code: 'LOGIN_FAILED', message }
    });
  }
});

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const body = registerSchema.parse(req.body);
    const result = await AuthService.registerTenant(body);
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    res.status(400).json({
      success: false,
      error: { code: 'REGISTRATION_FAILED', message }
    });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_TOKEN', message: 'Refresh token is required' }
      });
      return;
    }

    const result = await AuthService.refreshToken(refreshToken);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' }
    });
  }
});

// POST /auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    await AuthService.logout(req.ctx!.userId);
    res.json({
      success: true,
      data: { message: 'Logged out successfully' }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'LOGOUT_FAILED', message: 'Logout failed' }
    });
  }
});

// POST /auth/change-password
router.post('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const body = changePasswordSchema.parse(req.body);
    await AuthService.changePassword(
      req.ctx!.userId,
      body.currentPassword,
      body.newPassword
    );
    
    res.json({
      success: true,
      data: { message: 'Password changed successfully' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password change failed';
    res.status(400).json({
      success: false,
      error: { code: 'PASSWORD_CHANGE_FAILED', message }
    });
  }
});

// POST /auth/change-email
router.post('/change-email', authenticate, async (req: Request, res: Response) => {
  try {
    const body = changeEmailSchema.parse(req.body);
    await AuthService.changeEmail(
      req.ctx!.userId,
      body.newEmail,
      body.password
    );
    
    res.json({
      success: true,
      data: { message: 'Email changed successfully' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email change failed';
    res.status(400).json({
      success: false,
      error: { code: 'EMAIL_CHANGE_FAILED', message }
    });
  }
});

// GET /auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await AuthService.getUserById(req.ctx!.tenantId, req.ctx!.userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' }
      });
      return;
    }

    res.json({
      success: true,
      data: { user, permissions: req.ctx!.permissions }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch user' }
    });
  }
});

export default router;
