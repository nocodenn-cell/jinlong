import { useLanguage } from './LanguageContext';
import pt from './pt.json';
import zh from './zh.json';

const translations = { pt, zh };

export function useTranslations() {
  const { idioma } = useLanguage();
  
  function t(key: string): string {
    const keys = key.split('.')
    let value: unknown = translations[idioma as keyof typeof translations]
    for (const k of keys) {
      if (value === undefined || value === null) return key
      if (typeof value !== 'object') return key
      value = (value as Record<string, unknown>)[k]
    }
    return typeof value === 'string' ? value : key
  }
  
  return { t, idioma };
}
