const esbuild = require("esbuild")

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")

const plugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started")
    })

    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        if (!location) {
          console.error(`✘ [ERROR] ${text}`)
          return
        }

        console.error(`✘ [ERROR] ${text}`)
        console.error(`    ${location.file}:${location.line}:${location.column}:`)
      })

      console.log("[watch] build finished")
    })
  },
}

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "silent",
    plugins: [plugin],
  })

  if (watch) {
    await ctx.watch()
    return
  }

  await ctx.rebuild()
  await ctx.dispose()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
