import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'

const MAX_YAML_ALIAS_COUNT = 20

export function parsePostMatter(raw: string) {
  return matter(raw, {
    engines: {
      yaml: {
        parse(source: string): object {
          const value = parseYaml(source, {
            maxAliasCount: MAX_YAML_ALIAS_COUNT,
            uniqueKeys: true
          })
          return value && typeof value === 'object' ? value as object : {}
        }
      }
    }
  })
}
