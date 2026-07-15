export function requiredFields(form, fields) {
  return fields
    .filter(({ key }) => {
      const value = form[key];
      return value === undefined || value === null || String(value).trim() === '';
    })
    .map(({ label }) => label);
}

export function missingFieldsMessage(labels, lang = 'ar') {
  if (!labels.length) return '';
  return lang === 'ar'
    ? `يرجى تعبئة الحقول التالية: ${labels.join('، ')}`
    : `Please fill these fields: ${labels.join(', ')}`;
}