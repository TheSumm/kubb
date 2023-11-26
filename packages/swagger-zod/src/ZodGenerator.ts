import { Generator } from '@kubb/core'
import transformers from '@kubb/core/transformers'
import { getUniqueName } from '@kubb/core/utils'
import { getSchemaFactory, isReference } from '@kubb/swagger/utils'

import { pluginKey } from './plugin.ts'
import { zodKeywords, zodParser } from './zodParser.ts'

import type { PluginManager } from '@kubb/core'
import type { ts } from '@kubb/parser'
import type { ImportMeta, Oas, OasTypes, OpenAPIV3, Refs } from '@kubb/swagger'
import type { PluginOptions } from './types.ts'
import type { ZodMeta } from './zodParser.ts'

type Context = {
  oas: Oas
  pluginManager: PluginManager
}
export class ZodGenerator extends Generator<PluginOptions['resolvedOptions'], Context> {
  // Collect the types of all referenced schemas so we can export them later
  refs: Refs = {}
  imports: ImportMeta[] = []

  extraTexts: string[] = []

  aliases: ts.TypeAliasDeclaration[] = []

  // Keep track of already used type aliases
  #usedAliasNames: Record<string, number> = {}

  build({
    schema,
    baseName,
    description,
    keysToOmit,
  }: {
    schema: OasTypes.SchemaObject
    baseName: string
    description?: string
    keysToOmit?: string[]
  }): string[] {
    const texts: string[] = []
    const zodInput = this.getTypeFromSchema(schema, baseName)
    if (description) {
      texts.push(`
      /**
       * @description ${transformers.trim(description)}
       */`)
    }

    const zodOutput = zodParser(zodInput, { keysToOmit, name: this.context.pluginManager.resolveName({ name: baseName, pluginKey, type: 'function' }) })

    texts.push(zodOutput)

    return [...this.extraTexts, ...texts]
  }

  /**
   * Creates a type node from a given schema.
   * Delegates to getBaseTypeFromSchema internally and
   * optionally adds a union with null.
   */
  getTypeFromSchema(schema: OasTypes.SchemaObject, baseName?: string): ZodMeta[] {
    return this.#getBaseTypeFromSchema(schema, baseName) || []
  }

  /**
   * Recursively creates a type literal with the given props.
   */
  #getTypeFromProperties(baseSchema?: OasTypes.SchemaObject, baseName?: string): ZodMeta[] {
    const properties = baseSchema?.properties || {}
    const required = baseSchema?.required
    const additionalProperties = baseSchema?.additionalProperties

    const objectMembers = Object.keys(properties)
      .map((name) => {
        const validationFunctions: ZodMeta[] = []

        const schema = properties[name] as OasTypes.SchemaObject
        const isRequired = Array.isArray(required) ? required.includes(name) : !!required

        validationFunctions.push(...this.getTypeFromSchema(schema, name))

        if (schema.description) {
          validationFunctions.push({ keyword: zodKeywords.describe, args: `\`${schema.description.replaceAll('\n', ' ').replaceAll('`', "'")}\`` })
        }
        const min = schema.minimum ?? schema.minLength ?? schema.minItems ?? undefined
        const max = schema.maximum ?? schema.maxLength ?? schema.maxItems ?? undefined
        const matches = schema.pattern ?? undefined
        const nullable = schema.nullable ?? false
        const isEnum = validationFunctions.some((item) => item.keyword === zodKeywords.enum)

        if (!isEnum && min !== undefined) {
          // enums cannot have a min/max set in Zod
          validationFunctions.push({ keyword: zodKeywords.min, args: min })
        }
        if (!isEnum && max !== undefined) {
          // enums cannot have a min/max set in Zod
          validationFunctions.push({ keyword: zodKeywords.max, args: max })
        }
        if (matches) {
          const isStartWithSlash = matches.startsWith('/')
          const isEndWithSlash = matches.endsWith('/')

          const regexp = `new RegExp('${transformers.jsStringEscape(matches.slice(isStartWithSlash ? 1 : 0, isEndWithSlash ? -1 : undefined))}')`

          validationFunctions.push({ keyword: zodKeywords.matches, args: regexp })
        }

        if (schema.format === 'date-time' || baseName === 'date') {
          validationFunctions.push({ keyword: zodKeywords.datetime })
        }

        if (schema.format === 'email' || baseName === 'email') {
          validationFunctions.push({ keyword: zodKeywords.email })
        }

        if (schema.format === 'uri' || schema.format === 'hostname') {
          validationFunctions.push({ keyword: zodKeywords.url })
        }
        if (schema.format === 'uuid') {
          validationFunctions.push({ keyword: zodKeywords.uuid })
        }

        if (schema.readOnly) {
          validationFunctions.push({ keyword: zodKeywords.readOnly })
        }

        if (schema.default !== undefined && !Array.isArray(schema.default)) {
          if (typeof schema.default === 'string') {
            validationFunctions.push({ keyword: zodKeywords.default, args: `'${schema.default}'` })
          }
          if (typeof schema.default === 'boolean') {
            validationFunctions.push({ keyword: zodKeywords.default, args: schema.default ?? false })
          }
        }

        if (!isRequired && nullable) {
          validationFunctions.push({ keyword: zodKeywords.nullish })
        } else if (nullable) {
          validationFunctions.push({ keyword: zodKeywords.null })
        } else if (!isRequired) {
          validationFunctions.push({ keyword: zodKeywords.optional })
        }

        return {
          [name]: validationFunctions,
        }
      })
      .reduce((acc, curr) => ({ ...acc, ...curr }), {})

    const members: ZodMeta[] = []

    members.push({ keyword: zodKeywords.object, args: objectMembers })

    if (additionalProperties) {
      const addionalValidationFunctions: ZodMeta[] = additionalProperties === true
        ? [{ keyword: zodKeywords.any }]
        : this.getTypeFromSchema(additionalProperties as OasTypes.SchemaObject)

      members.push({ keyword: zodKeywords.catchall, args: addionalValidationFunctions })
    }

    return members
  }

  /**
   * Create a type alias for the schema referenced by the given ReferenceObject
   */
  #getRefAlias(obj: OpenAPIV3.ReferenceObject, _baseName?: string): ZodMeta[] {
    const { $ref } = obj
    let ref = this.refs[$ref]

    if (ref) {
      return [{ keyword: zodKeywords.ref, args: ref.propertyName }]
    }

    const originalName = getUniqueName($ref.replace(/.+\//, ''), this.#usedAliasNames)
    const propertyName = this.context.pluginManager.resolveName({ name: originalName, pluginKey, 'type': 'function' })

    ref = this.refs[$ref] = {
      propertyName,
      originalName,
    }

    const path = this.context.pluginManager.resolvePath({ baseName: propertyName, pluginKey })

    this.imports.push({
      ref,
      path: path || '',
      isTypeOnly: false,
    })

    return [{ keyword: zodKeywords.ref, args: ref.propertyName }]
  }

  #getParsedSchema(schema?: OasTypes.SchemaObject) {
    const parsedSchema = getSchemaFactory(this.context.oas)(schema)
    return parsedSchema
  }

  /**
   * This is the very core of the OpenAPI to TS conversion - it takes a
   * schema and returns the appropriate type.
   */
  #getBaseTypeFromSchema(_schema: OasTypes.SchemaObject | undefined, baseName?: string): ZodMeta[] {
    const { schema, version } = this.#getParsedSchema(_schema)

    if (!schema) {
      return [{ keyword: zodKeywords.any }]
    }

    if (isReference(schema)) {
      return this.#getRefAlias(schema, baseName)
    }

    if (schema.oneOf) {
      // union
      const schemaWithoutOneOf = { ...schema, oneOf: undefined }

      const union: ZodMeta = {
        keyword: zodKeywords.union,
        args: schema.oneOf
          .map((item) => {
            return item && this.getTypeFromSchema(item as OasTypes.SchemaObject)[0]
          })
          .filter(Boolean)
          .filter((item) => {
            return item && item.keyword !== zodKeywords.any
          }),
      }
      if (schemaWithoutOneOf.properties) {
        return [...this.getTypeFromSchema(schemaWithoutOneOf, baseName), union]
      }

      return [union]
    }

    if (schema.anyOf) {
      // union
      const schemaWithoutAnyOf = { ...schema, anyOf: undefined }

      const union: ZodMeta = {
        keyword: zodKeywords.union,
        args: schema.anyOf
          .map((item) => {
            return item && this.getTypeFromSchema(item as OasTypes.SchemaObject)[0]
          })
          .filter(Boolean)
          .filter((item) => {
            return item && item.keyword !== zodKeywords.any
          }),
      }
      if (schemaWithoutAnyOf.properties) {
        return [...this.getTypeFromSchema(schemaWithoutAnyOf, baseName), union]
      }

      return [union]
    }
    if (schema.allOf) {
      // intersection/add
      const schemaWithoutAllOf = { ...schema, allOf: undefined }

      const and: ZodMeta = {
        keyword: zodKeywords.and,
        args: schema.allOf
          .map((item) => {
            return item && this.getTypeFromSchema(item as OasTypes.SchemaObject)[0]
          })
          .filter(Boolean)
          .filter((item) => {
            return item && item.keyword !== zodKeywords.any
          }),
      }

      if (schemaWithoutAllOf.properties) {
        return [
          {
            ...and,
            args: [...(and.args || []), ...this.getTypeFromSchema(schemaWithoutAllOf, baseName)],
          },
        ]
      }

      return [and]
    }

    if (schema.enum) {
      if ('x-enumNames' in schema) {
        return [
          {
            keyword: zodKeywords.enum,
            args: [...new Set(schema['x-enumNames'] as string[])].map((value: string) => `\`${value}\``),
          },
        ]
      }

      if (schema.type === 'number' || schema.type === 'integer') {
        // we cannot use z.enum when enum type is number/integer
        return [
          {
            keyword: zodKeywords.union,
            args: [...new Set(schema.enum)].map((value: string) => {
              return {
                keyword: zodKeywords.literal,
                args: value,
              }
            }),
          },
        ]
      }

      return [
        {
          keyword: zodKeywords.enum,
          args: [...new Set(schema.enum)].map((value: string) => `\`${value}\``),
        },
      ]
    }

    if ('items' in schema) {
      // items -> array
      return [{ keyword: zodKeywords.array, args: this.getTypeFromSchema(schema.items as OasTypes.SchemaObject, baseName) }]
    }

    if ('prefixItems' in schema) {
      const prefixItems = schema.prefixItems as OasTypes.SchemaObject[]

      return [
        {
          keyword: zodKeywords.tuple,
          args: prefixItems
            .map((item) => {
              // no baseType so we can fall back on an union when using enum
              return this.getTypeFromSchema(item, undefined)[0]
            })
            .filter(Boolean),
        },
      ]
    }

    if (schema.properties || schema.additionalProperties) {
      // properties -> literal type
      return this.#getTypeFromProperties(schema, baseName)
    }

    if (schema.type) {
      if (Array.isArray(schema.type)) {
        // OPENAPI v3.1.0: https://www.openapis.org/blog/2021/02/16/migrating-from-openapi-3-0-to-3-1-0
        const [type] = schema.type as Array<OpenAPIV3.NonArraySchemaObjectType>

        return [
          ...this.getTypeFromSchema(
            {
              ...schema,
              type,
            },
            baseName,
          ),
          { keyword: zodKeywords.null },
        ]
      }

      // string, boolean, null, number
      if (schema.type in zodKeywords) {
        return [{ keyword: schema.type }]
      }
    }

    if (schema.format === 'binary') {
      // TODO binary
    }

    return [{ keyword: zodKeywords.any }]
  }
}