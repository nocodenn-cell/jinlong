import { useLanguage } from './LanguageContext';
import pt from './pt.json';
import zh from './zh.json';

const translations = { pt, zh };

export function useTranslations() {
  const { idioma } = useLanguage();
  
  function t(key: string): string {
    const keys = key.split('.');
    let value: any = translations[idioma as keyof typeof translations];
    for (const k of keys) {
      if (value === undefined) return key;
      value = value[k];
    }
    return value || key;
  }
  
  return { t, idioma };
}
