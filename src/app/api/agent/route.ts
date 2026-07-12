import { createRequestId, ok } from '@/lib/admin/response'

export async function GET() {
  const requestId = createRequestId()

  const spec = {
    name: 'MLog Blog - AI Agent Content API',
    version: '1.0.0',
    description:
      'AI Agent 通过此 API 自动撰写和发布双语博客文章。\n首先 GET 本端点了解规范，然后用密钥调用 POST 接口。',
    authentication: {
      type: 'Bearer Token',
      description: '所有写操作(POST)需要认证',
      header: 'Authorization: Bearer <your-api-key>',
      how_to_get: '在「我的」页面中生成 API 密钥。',
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
        description: '创建一篇双语博客文章（同时提供中文和英文版本）',
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
        description: '上传一张图片，返回 URL 可在 Markdown 中引用',
        body: 'multipart/form-data, file 字段',
        supported_formats: 'jpg/png/gif/webp/svg'
      }
    },
    call_examples: {
      curl_with_auth: [
        '# 创建文章',
        'curl -X POST https://YOUR_DOMAIN/api/agent/post \\',
        '  -H "Authorization: Bearer mlog_<your-key>" \\',
        '  -H "Content-Type: application/json" \\',
        '  -d \'{"slug":"demo","zh":{"title":"标题","content":"# 正文"},"en":{"title":"Title","content":"# Content"},"tags":["AI"],"category":"Tech"}\'',
        '',
        '# 上传图片',
        'curl -X POST https://YOUR_DOMAIN/api/agent/upload \\',
        '  -H "Authorization: Bearer mlog_<your-key>" \\',
        '  -F "file=@screenshot.png"'
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
      '分类保持一致不要随意新建'
    ]
  }

  return ok(requestId, spec)
}
