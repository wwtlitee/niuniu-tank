"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { auditAssets } = require("./asset-audit.cjs");
const { collectRuntimeCatalog } = require("./asset-runtime-catalog.cjs");
const { GEOMETRY_PREVIEW_ASSETS, UNUSABLE_PREVIEW_ASSETS } = require("./generate-asset-contact-sheets.cjs");

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const assetRoot = path.join(projectRoot, "assets");
  const engineFile = path.join(projectRoot, "js", "engine.js");
  const audit = auditAssets({ assetRoot, engineFile });
  const relativeFiles = audit.categorySummary.flatMap((category) =>
    fs.readdirSync(path.join(assetRoot, category.category), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".glb"))
      .map((entry) => `${category.category}/${entry.name}`),
  );
  relativeFiles.sort((a, b) => a.localeCompare(b));
  const runtime = await collectRuntimeCatalog({ projectRoot, relativeFiles });
  const registered = new Set(audit.registry.map((entry) => entry.relative));
  const rows = runtime.map((row) => ({ ...row, registered: registered.has(row.relative) }));
  const payload = {
    version: "5.0.0",
    generatedAt: new Date().toISOString(),
    totals: audit.totals,
    categorySummary: audit.categorySummary,
    missing: audit.missing,
    unregistered: audit.unregistered,
    models: rows,
  };

  const materialDir = path.join(projectRoot, "pdoc", "material");
  const reportDir = path.join(projectRoot, "pdoc", "report");
  fs.mkdirSync(materialDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(materialDir, "MAT_全量模型运行态台账_v5.0.0.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );

  const lines = [
    "# REPORT_全量模型资产审计 v5.0.0",
    "",
    "> 日期：2026-09-01 ｜ 负责人：Unclecow ｜ 数据来源：真实 GLTFLoader 运行态包围盒",
    "",
    "## 摘要",
    "",
    `- 正式文件：${audit.totals.files}`,
    `- GLB：${audit.totals.glbs}`,
    `- 引擎注册：${audit.totals.registered}`,
    `- 缺失：${audit.missing.length}`,
    `- 未注册：${audit.unregistered.length}`,
    `- 总体积：${(audit.totals.bytes / 1024 / 1024).toFixed(2)} MiB`,
    `- 原生材质需替换：${GEOMETRY_PREVIEW_ASSETS.size}`,
    `- 隔离禁用：${UNUSABLE_PREVIEW_ASSETS.size}`,
    "",
    "## 分类统计",
    "",
    "| 分类 | 文件 | GLB | 大小 MiB |",
    "| :--- | ---: | ---: | ---: |",
    ...audit.categorySummary.map((row) =>
      `| ${row.category} | ${row.files} | ${row.glbs} | ${(row.bytes / 1024 / 1024).toFixed(2)} |`,
    ),
    "",
    "## 未注册模型",
    "",
    ...audit.unregistered.map((relative) => `- \`${relative}\``),
    "",
    "## 可见性异常",
    "",
    ...[...GEOMETRY_PREVIEW_ASSETS].map((relative) => `- \`${relative}\`：几何可用，原生材质不可读，启用前必须替换材质。`),
    ...[...UNUSABLE_PREVIEW_ASSETS].map((relative) => `- \`${relative}\`：隔离渲染仍不可见，禁止进入生存模式白名单。`),
    "",
    "## 全量运行态尺寸",
    "",
    "| 模型 | 注册 | 尺寸 X×Y×Z | Mesh | 顶点 | 材质 | 动画 |",
    "| :--- | :---: | :--- | ---: | ---: | ---: | ---: |",
    ...rows.map((row) =>
      `| \`${row.relative}\` | ${row.registered ? "是" : "否"} | ${row.size.join("×")} | ${row.meshes} | ${row.vertices} | ${row.materials} | ${row.animations.length} |`,
    ),
    "",
    "## Verdict",
    "",
    audit.missing.length ? "NON-COMPLIANT：存在代码引用缺失。" : "WARNINGS：无缺失引用，但有未注册模型，需在 P2 明确职责后决定是否启用。",
    "",
    "## Change Logs",
    "",
    "| 日期 | 版本号 | 变更描述 | 负责人 |",
    "| :--- | :--- | :--- | :--- |",
    "| 2026-09-01 | v5.0.0 | 首次生成全量模型运行态台账 | Unclecow |",
    "",
  ];
  fs.writeFileSync(
    path.join(reportDir, "REPORT_全量模型资产审计_v5.0.0.md"),
    lines.join("\n"),
    "utf8",
  );
  process.stdout.write(`catalog models=${rows.length} missing=${audit.missing.length} unregistered=${audit.unregistered.length}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
