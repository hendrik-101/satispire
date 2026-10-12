try {
  const port = process.env.PORT ?? '3000';
  if (!/^[0-9]+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error('Invalid port');
  const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
    signal: AbortSignal.timeout(2500),
  });
  if (response.status !== 200 || (await response.json()).status !== 'ok')
    throw new Error('Not healthy');
} catch {
  process.exitCode = 1;
}
export {};
