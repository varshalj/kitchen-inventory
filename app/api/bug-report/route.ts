import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { description, pageUrl, userAgent, consoleLogs, userId, userEmail } = await request.json()

    if (!description || typeof description !== "string") {
      return NextResponse.json({ error: "Description is required" }, { status: 400 })
    }

    const githubToken = process.env.GITHUB_TOKEN
    const repoOwner = process.env.GITHUB_REPO_OWNER || "varshalj"
    const repoName = process.env.GITHUB_REPO_NAME || "kitchen-inventory"

    if (!githubToken) {
      console.error("GITHUB_TOKEN not configured for bug reports")
      return NextResponse.json({ error: "Bug reporting is not configured" }, { status: 500 })
    }

    const body = [
      `## Bug Report`,
      ``,
      `**Description:**`,
      description,
      ``,
      `**Page URL:** ${pageUrl || "N/A"}`,
      `**User Agent:** ${userAgent || "N/A"}`,
      `**Reported at:** ${new Date().toISOString()}`,
      ``,
      `**Reporter:**`,
      `- User ID: \`${userId || "not authenticated"}\``,
      `- Email: ${userEmail ? `\`${userEmail}\`` : "not available"}`,
    ]

    if (consoleLogs && consoleLogs.trim()) {
      body.push(
        ``,
        `<details>`,
        `<summary>Console Logs</summary>`,
        ``,
        "```",
        consoleLogs.slice(0, 5000),
        "```",
        `</details>`,
      )
    }

    const ghResponse = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `[Bug] ${description.slice(0, 80)}${description.length > 80 ? "..." : ""}`,
          body: body.join("\n"),
          labels: ["bug", "user-reported"],
        }),
      },
    )

    if (!ghResponse.ok) {
      const err = await ghResponse.text()
      console.error("GitHub API error:", err)
      return NextResponse.json({ error: "Failed to create GitHub issue" }, { status: 502 })
    }

    const issue = await ghResponse.json()
    return NextResponse.json({ success: true, issueNumber: issue.number })
  } catch (error) {
    console.error("Bug report error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
