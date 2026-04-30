// Validação de resultados de providers fiscais
// Validação simples sem dependências externas para compatibilidade com Deno

// Validação simplificada para runtime (sem Zod)
export function validateProviderResultSimple(result: unknown): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!result || typeof result !== 'object') {
    errors.push("Resultado deve ser um objeto");
    return { isValid: false, errors };
  }
  
  const r = result as Record<string, unknown>;
  
  // Verificar campo ok
  if (typeof r.ok !== 'boolean') {
    errors.push("Campo 'ok' deve ser booleano");
    return { isValid: false, errors };
  }
  
  if (r.ok) {
    // Validação de sucesso
    if (typeof r.chave_fiscal !== 'string' || !r.chave_fiscal.trim()) {
      errors.push("chave_fiscal é obrigatória em sucesso");
    }
    if (typeof r.protocolo !== 'string' || !r.protocolo.trim()) {
      errors.push("protocolo é obrigatório em sucesso");
    }
    // provider_ref e payload são opcionais
  } else {
    // Validação de erro
    if (typeof r.erro !== 'string' || !r.erro.trim()) {
      errors.push("erro é obrigatório em falha");
    }
    // outros campos são opcionais
  }
  
  return { isValid: errors.length === 0, errors };
}

// Função principal de validação e normalização
export function validateAndNormalizeProviderResult(result: unknown): Promise<{
  isValid: boolean;
  errors: string[];
  normalizedResult?: any;
}> {
  // Usar apenas validação simples para compatibilidade com Deno
  const simpleValidation = validateProviderResultSimple(result);
  return Promise.resolve({
    isValid: simpleValidation.isValid,
    errors: simpleValidation.errors,
    normalizedResult: result, // Retorna original se validação simples passar
  });
}
