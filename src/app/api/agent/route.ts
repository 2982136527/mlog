import { createRequestId, ok } from '@/lib/admin/response'

export async function GET() {
  const requestId = createRequestId()

  const spec = {
    name: 'MLog Blog - AI Agent Content API',
    version: '1.3.0',
    description:
      'AI Agent 通过此 API 自动撰写和发布双语博客文章。\n首先 GET 本端点了解规范，然后用密钥调用 POST 接口。',
    authentication: {
      type: 'Bearer Token',
      description: '所有写操作(POST)需要认证',
      header: 'Authorization: Bearer <your-api-key>',
      how_to_get: '仅站点管理员可在「我的」页面中生成 API 密钥。',
      note: 'GET 本端点不需要认证'
    },
    writing_standards: {
      bilingual_requirement: '必须同时提供中文(zh)和英文(en)两个版本',
      frontmatter_format: {
        title: '文章标题',
        date: 'ISO日期 YYYY-MM-DD，默认当天',
        summary: '文章摘要',
        tags: '标签数组，至少1个',
        category: '分类名称',
        cover: '封面图路径，可选'
      },
      content_format: 'Markdown 格式',
      slug_rules: '英文小写+连字符，唯一标识'
    },
    endpoints: {
      create_post: {
        method: 'POST',
        path: '/api/agent/post',
        auth_required: true,
        description: '创建一篇新的双语博客文章；slug 已存在时返回 409，不会覆盖现有文章。',
        response_states: 'published | pending_review | refresh_pending；只有 published 表示公开内容缓存已确认失效',
        request_body: {
          slug: 'string (required) - URL 标识符，小写字母、数字和连字符',
          zh: {
            title: 'string (required)',
            summary: 'string (required)',
            content: 'string (required) - Markdown 正文'
          },
          en: {
            title: 'string (required)',
            summary: 'string (required)',
            content: 'string (required) - Markdown body'
          },
          tags: 'string[] (required) - 至少1个标签',
          category: 'string (required)',
          date: 'string (optional) - ISO 8601，默认当天',
          cover: 'string (optional) - 封面图片 URL'
        }
      },
      upload_image: {
        method: 'POST',
        path: '/api/agent/upload',
        auth_required: true,
        description: '把图片直接写入专用图仓，不创建图片 PR，也不触发 Vercel Deploy Hook。只有 ready 状态的图片才可写入文章。',
        body: 'multipart/form-data；file 必填，alt 可选',
        supported_formats: 'jpg/png/gif/webp',
        response_states: 'ready | processing | failed；ready 时 available=true 且 url/markdown 非空；processing 返回 HTTP 202 和 poll.url'
      },
      get_image_status: {
        method: 'GET',
        path: '/api/agent/media/{id}',
        auth_required: true,
        description: '使用上传响应中的 poll.url 查询媒体状态。收到 202 时按 Retry-After 或 poll.afterMs 继续轮询；仅在 status=ready、available=true 后引用返回的 url 或 markdown。'
      }
    },
    call_examples: {
      curl_with_auth: [
        '# 创建文章',
        'curl -X POST https://YOUR_DOMAIN/api/agent/post \\',
        '  -H "Authorization: Bearer mlog_<your-key>" \\',
        '  -H "Content-Type: application/json" \\',
        '  -d \'{"slug":"demo","zh":{"title":"标题","summary":"摘要","content":"# 正文"},"en":{"title":"Title","summary":"Summary","content":"# Content"},"tags":["AI"],"category":"Tech"}\'',
        '',
        '# 上传图片',
        'curl -X POST https://YOUR_DOMAIN/api/agent/upload \\',
        '  -H "Authorization: Bearer mlog_<your-key>" \\',
        '  -F "file=@screenshot.png" \\',
        '  -F "alt=Screenshot description"',
        '',
        '# 如果上传返回 202，使用响应中的 poll.url 轮询',
        'curl https://YOUR_DOMAIN/api/agent/media/<media-id> \\',
        '  -H "Authorization: Bearer mlog_<your-key>"'
      ].join('\n'),
      openai_function_tool: {
        type: 'function',
        function: {
          name: 'create_blog_post',
          description: 'Create a bilingual blog post (Chinese + English) on MLog',
          parameters: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'URL identifier, lowercase letters, numbers and hyphens'
              },
              zh: {
                type: 'object',
                description: 'Chinese version',
                properties: {
                  title: { type: 'string' },
                  summary: { type: 'string' },
                  content: { type: 'string' }
                },
                required: ['title', 'summary', 'content']
              },
              en: {
                type: 'object',
                description: 'English version',
                properties: {
                  title: { type: 'string' },
                  summary: { type: 'string' },
                  content: { type: 'string' }
                },
                required: ['title', 'summary', 'content']
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                description: 'Tags in lowercase English'
              },
              category: {
                type: 'string',
                enum: ['Tech', 'Life', 'Tutorial', 'Thoughts', 'Project']
              }
            },
            required: ['slug', 'zh', 'en', 'tags', 'category']
          }
        }
      }
    },
    tips: [
      '中英文标题可以不同但主题需一致',
      '标签 2-4 个，与内容相关',
      '分类保持一致不要随意新建',
      '图片上传返回 202 时先轮询；只有 ready 且 available=true 的媒体 URL 才能用于正文或 cover'
    ]
  }

  return ok(requestId, spec)
}
