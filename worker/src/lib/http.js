export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...(init.headers || {}),
    },
  });
}

export function attachment(content, filename, contentType) {
  return new Response(content, {
    headers: {
      ...corsHeaders(),
      'content-type': contentType,
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}

export function empty(status = 204) {
  return new Response(null, {
    status,
    headers: corsHeaders(),
  });
}

export function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
  };
}

export async function readJson(request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

export function notFound(message = 'Ruta no encontrada') {
  return json({ ok: false, error: message }, { status: 404 });
}

export function methodNotAllowed() {
  return json({ ok: false, error: 'Metodo no permitido' }, { status: 405 });
}

export function fail(error, status = 400) {
  return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status });
}
