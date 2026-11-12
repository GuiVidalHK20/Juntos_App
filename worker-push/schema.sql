-- Banco D1 do Worker de lembretes (plano gratuito: 5 GB, 100 mil linhas gravadas/dia).
-- Guarda o MÍNIMO: o endereço de push do aparelho (sem nome, e-mail ou uid), os horários e dois contadores.
CREATE TABLE IF NOT EXISTS subs (
  endpoint   TEXT PRIMARY KEY,           -- endereço de notificação do navegador (identifica o aparelho)
  cfg        TEXT NOT NULL DEFAULT '',   -- impressão dos horários/dias/fuso; igual => só "toca" a linha (1 gravação)
  skip_until INTEGER NOT NULL DEFAULT 0, -- ms: não enviar antes disso (silêncio ou "já estudou hoje")
  last_sent  INTEGER NOT NULL DEFAULT 0, -- ms do último envio (evita repetir)
  fails      INTEGER NOT NULL DEFAULT 0, -- falhas temporárias seguidas
  updated    INTEGER NOT NULL            -- ms da última vez que o app avisou que o aparelho está em uso
);
CREATE TABLE IF NOT EXISTS slots (
  endpoint TEXT NOT NULL,
  mow      INTEGER NOT NULL,             -- minuto da semana em UTC (0 = domingo 00:00 UTC … 10079)
  PRIMARY KEY (endpoint, mow)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS slots_mow ON slots (mow);
