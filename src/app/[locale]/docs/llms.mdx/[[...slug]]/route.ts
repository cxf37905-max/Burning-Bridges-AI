export const revalidate = false;

export function GET() {
  // 即使代理未执行，也不对外输出模板文档正文。
  return new Response('Page not found.', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex',
    },
  });
}
