const fs = require("fs");
const path = require("path");

module.exports = async ({ github, context, core }) => {
    if (!fs.existsSync(process.env.PULL_REQUEST_NUMBER_PATH) || !fs.statSync(process.env.PULL_REQUEST_NUMBER_PATH).isFile()) {
        core.info("No pull request number file found.");
        return;
    }

    if (!fs.existsSync(process.env.REPORTS_PATH) || !fs.statSync(process.env.REPORTS_PATH).isFile()) {
        core.info("No reports file found.");
        return;
    }

    const PULL_REQUEST_NUMBER = parseInt(fs.readFileSync(process.env.PULL_REQUEST_NUMBER_PATH, "utf8").trim(), 10);
    if (isNaN(PULL_REQUEST_NUMBER)) {
        core.info("Parse PULL_REQUEST_NUMBER error.");
        return;
    }

    const ALL_REPORTS = fs.readFileSync(process.env.REPORTS_PATH, "utf8").trim().split("\n").filter(Boolean);

    const { owner, repo } = context.repo;
    const { data: pr } = await github.rest.pulls.get({
        owner,
        repo,
        pull_number: PULL_REQUEST_NUMBER,
    });
    core.info(`pr: ${JSON.stringify(pr, undefined, 2)}`);

    if (pr.state !== "open") {
        core.info("pr.state !== open");
        return;
    }

    const run = context.payload.workflow_run;
    core.info(`run: ${JSON.stringify(run, undefined, 2)}`);

    if (pr.head.sha !== run.head_sha) {
        core.info("pr.head.sha !== run.head_sha");
        return;
    }

    if (pr.head.ref !== run.head_branch) {
        core.info("pr.head.ref !== run.head_branch");
        return;
    }

    if (pr.head.repo.full_name !== run.head_repository.full_name) {
        core.info("pr.head.repo.full_name !== run.head_repository.full_name");
        return;
    }

    if (pr.user.login !== run.actor.login) {
        core.info("pr.user.login !== run.actor.login");
        return;
    }

    const comments = [];
    for (const report of ALL_REPORTS) {
        try {
            const data = JSON.parse(report);

            const filePath = data.location?.path;
            const line = data.location?.range?.start?.line;
            const message = data.message;
            const severity = data.severity || "INFO";
            const code = data.code?.value ? `[${data.code.value}] ` : "";

            if (filePath && line) {
                comments.push({
                    path: filePath,
                    line,
                    side: "RIGHT",
                    body: `**[${severity}]** ${code}\n\n${message}`
                });
            }
        } catch (error) {
            core.error(`Failed to parse report: ${report} ${error}`);
        }
    }

    if (comments.length === 0) {
        core.info("No diagnostics to report as comments.");
        return;
    }

    core.info(`Prepared ${comments.length} comments to post.`);

    try {
        await github.rest.pulls.createReview({
            owner,
            repo,
            pull_number: PULL_REQUEST_NUMBER,
            commit_id: run.head_sha,
            body: "🤖 Static analysis found the following issues:",
            event: "COMMENT",
            comments: comments
        });
        core.info("Successfully posted review comments!");
    } catch (error) {
        core.error(`Error posting review comments to GitHub: ${error}`);
        throw error;
    }
}
