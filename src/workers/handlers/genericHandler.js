async function genericHandler(payload) {
  const ms = Number(payload?.durationMs ?? 250);
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  return { ok: true, sleptMs: ms };
}

module.exports = { genericHandler };

