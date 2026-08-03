export const colors = {
  bg: '#020617',
  card: '#0f172a',
  cardBorder: 'rgba(20,184,166,0.15)',
  primary: '#14b8a6',
  primaryLight: '#2dd4bf',
  accent: '#4ade80',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  error: '#ef4444',
  white: '#ffffff',
};

export const styles = {
  card: {
    backgroundColor: 'rgba(15,23,42,0.8)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center' as const,
  },
  buttonText: {
    color: colors.white,
    fontWeight: '700' as const,
    fontSize: 16,
  },
  input: {
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderRadius: 16,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(20,184,166,0.1)',
  },
};
