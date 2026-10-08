export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);
    if (url.pathname === '/debug-tables') {
      const users = await env.DB.prepare('PRAGMA foreign_key_check').all();
      const pragmaFK = await env.DB.prepare('PRAGMA foreign_keys').all();
      return new Response(JSON.stringify({ foreign_key_check: users.results, pragmaFK: pragmaFK.results }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('ok');
  }
};
