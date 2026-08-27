require("dotenv").config();
const prisma = require("../src/config/database");

async function main() {
  const force = process.argv.includes("--force");
  const result = await prisma.episode.updateMany({
    where: {
      isDeleted: false,
      audio: { not: null },
      ...(force ? {} : { transcriptStatus: { in: ["PENDING", "UNAVAILABLE", "FAILED"] } }),
    },
    data: {
      transcriptStatus: "QUEUED",
      transcriptError: null,
      ...(force ? {
        transcriptSourceAudio: null,
        transcriptModel: null,
        transcriptDurationMs: null,
      } : {}),
    },
  });
  console.log(`${result.count} stored episode transcript${result.count === 1 ? "" : "s"} queued.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
