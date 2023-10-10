import { getRelativePath, URLPath } from '@kubb/core'
import { OperationGenerator as Generator } from '@kubb/swagger'
import { pluginName as swaggerTypescriptPluginName } from '@kubb/swagger-ts'

import { ClientBuilder } from '../builders/ClientBuilder.tsx'
import { pluginName } from '../plugin.ts'

import type { File, OptionalPath, PluginContext, PluginManager } from '@kubb/core'
import type { ContentType, HttpMethod, Oas, Operation, OperationSchemas, ResolvePathOptions, Resolver, SkipBy } from '@kubb/swagger'
import type { Options as PluginOptions } from '../types'
import type { FileMeta } from '../types.ts'

type Options = {
  pluginManager: PluginManager
  clientPath?: OptionalPath
  dataReturnType: PluginOptions['dataReturnType']
  oas: Oas
  contentType?: ContentType
  skipBy: SkipBy[]
  resolvePath: PluginContext<ResolvePathOptions>['resolvePath']
  resolveName: PluginContext['resolveName']
}

export class OperationGenerator extends Generator<Options> {
  resolve(operation: Operation): Resolver {
    const { resolvePath, resolveName } = this.options

    const name = resolveName({ name: operation.getOperationId(), pluginName })

    if (!name) {
      throw new Error('Name should be defined')
    }

    const fileName = `${name}.ts`
    const filePath = resolvePath({
      fileName,
      options: { tag: operation.getTags()[0]?.name },
    })

    if (!filePath) {
      throw new Error('Filepath should be defined')
    }

    return {
      name,
      fileName,
      filePath,
    }
  }

  resolveType(operation: Operation): Resolver {
    const { resolvePath, resolveName } = this.options

    const name = resolveName({ name: operation.getOperationId(), pluginName: swaggerTypescriptPluginName })

    if (!name) {
      throw new Error('Name should be defined')
    }

    const fileName = `${name}.ts`
    const filePath = resolvePath({ fileName, options: { tag: operation.getTags()[0]?.name }, pluginName: swaggerTypescriptPluginName })

    if (!filePath) {
      throw new Error('Filepath should be defined')
    }

    return {
      name,
      fileName,
      filePath,
    }
  }

  async all(paths: Record<string, Record<HttpMethod, Operation>>): Promise<File<FileMeta> | null> {
    const { resolvePath, resolveName, oas } = this.options

    const controllerName = resolveName({ name: 'operations' })

    if (!controllerName) {
      throw new Error('controllerName should be defined')
    }

    const controllerId = `${controllerName}.ts`
    const controllerFilePath = resolvePath({
      fileName: controllerId,
    })

    if (!controllerFilePath) {
      return null
    }
    // end controller setup

    const sources: string[] = []

    const groupedByOperationId: Record<string, { path: string; method: HttpMethod }> = {}

    Object.keys(paths).forEach((path) => {
      Object.keys(paths[path]).forEach((method) => {
        const operation = oas.operation(path, method as HttpMethod)
        if (operation) {
          groupedByOperationId[operation.getOperationId()] = {
            path: new URLPath(path).URL,
            method: method as HttpMethod,
          }
        }
      })
    })

    sources.push(`export const operations = ${JSON.stringify(groupedByOperationId)} as const;`)

    return {
      path: controllerFilePath,
      fileName: controllerId,
      source: sources.join('\n'),
      imports: [],
    }
  }

  async get(operation: Operation, schemas: OperationSchemas): Promise<File<FileMeta> | null> {
    const { pluginManager, oas, clientPath, dataReturnType } = this.options

    const controller = this.resolve(operation)
    const type = this.resolveType(operation)

    const clientBuilder = new ClientBuilder(oas).configure({
      pluginManager,
      name: controller.name,
      operation,
      schemas,
      dataReturnType,
      clientPath: clientPath ? getRelativePath(controller.filePath, clientPath) : '@kubb/swagger-client/client',
    })

    return {
      path: controller.filePath,
      fileName: controller.fileName,
      source: clientBuilder.print(),
      imports: [
        ...clientBuilder.imports(),
        {
          name: [schemas.response.name, schemas.pathParams?.name, schemas.queryParams?.name, schemas.headerParams?.name].filter(Boolean),
          path: getRelativePath(controller.filePath, type.filePath),
          isTypeOnly: true,
        },
      ],
      meta: {
        pluginName,
        tag: operation.getTags()[0]?.name,
      },
    }
  }

  async post(operation: Operation, schemas: OperationSchemas): Promise<File<FileMeta> | null> {
    const { pluginManager, oas, clientPath, dataReturnType } = this.options

    const controller = this.resolve(operation)
    const type = this.resolveType(operation)

    const clientBuilder = new ClientBuilder(oas).configure({
      pluginManager,
      name: controller.name,
      operation,
      schemas,
      dataReturnType,
      clientPath: clientPath ? getRelativePath(controller.filePath, clientPath) : '@kubb/swagger-client/client',
    })

    return {
      path: controller.filePath,
      fileName: controller.fileName,
      source: clientBuilder.print(),
      imports: [
        ...clientBuilder.imports(),
        {
          name: [schemas.request?.name, schemas.response.name, schemas.pathParams?.name, schemas.queryParams?.name, schemas.headerParams?.name].filter(Boolean),
          path: getRelativePath(controller.filePath, type.filePath),
          isTypeOnly: true,
        },
      ],
      meta: {
        pluginName,
        tag: operation.getTags()[0]?.name,
      },
    }
  }

  async put(operation: Operation, schemas: OperationSchemas): Promise<File<FileMeta> | null> {
    return this.post(operation, schemas)
  }
  async patch(operation: Operation, schemas: OperationSchemas): Promise<File<FileMeta> | null> {
    return this.post(operation, schemas)
  }
  async delete(operation: Operation, schemas: OperationSchemas): Promise<File<FileMeta> | null> {
    return this.post(operation, schemas)
  }
}
