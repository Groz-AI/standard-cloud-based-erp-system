import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language;

  const toggleLanguage = () => {
    const newLang = currentLang === 'en' ? 'ar' : 'en';
    i18n.changeLanguage(newLang);
  };

  return (
    <Button
      onClick={toggleLanguage}
      variant="ghost"
      size="icon"
      className={cn(
        "relative h-9 w-9 rounded-xl transition-all hover:bg-slate-100",
        currentLang === 'ar' && "bg-blue-50 text-blue-700 hover:bg-blue-100"
      )}
      title={currentLang === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}
    >
      <Globe className="h-5 w-5" />
      <span className="absolute -bottom-0.5 -right-0.5 text-[10px] font-bold bg-white border border-slate-200 rounded px-1 leading-none py-0.5">
        {currentLang === 'ar' ? 'ع' : 'EN'}
      </span>
    </Button>
  );
}
