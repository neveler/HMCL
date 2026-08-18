const fs = require("fs");

module.exports = async ({ github, context, core }) => {
    const prNumberPath = process.env.PULL_REQUEST_NUMBER_PATH;
    if (!prNumberPath || !fs.existsSync(prNumberPath) || !fs.statSync(prNumberPath).isFile()) {
        core.info("Pull request number file not found.");
        return;
    }

    const reportsPath = process.env.REPORTS_PATH;
    if (!reportsPath || !fs.existsSync(reportsPath) || !fs.statSync(reportsPath).isFile()) {
        core.info("Reports file not found.");
        return;
    }

    const PULL_REQUEST_NUMBER = parseInt(fs.readFileSync(prNumberPath, "utf8").trim(), 10);
    if (isNaN(PULL_REQUEST_NUMBER)) {
        core.info("Failed to parse the pull request number.");
        return;
    }

    const { owner, repo } = context.repo;

    let pr;
    try {
        const response = await github.rest.pulls.get({
            owner,
            repo,
            pull_number: PULL_REQUEST_NUMBER,
        });
        pr = response.data;
    } catch (error) {
        core.error(`Failed to fetch PR #${PULL_REQUEST_NUMBER}: ${error.message}`);
        return;
    }

    core.info(`Current PR state: ${pr.state}`);
    if (pr.state !== "open") {
        core.info("The pull request is not open. Skipping comment creation.");
        return;
    }

    const run = context.payload.workflow_run;
    if (!run) {
        core.warning("context.payload.workflow_run is undefined. Ensure this script runs on the 'workflow_run' event.");
        return;
    }

    if (pr.head.sha !== run.head_sha) {
        core.info("PR head SHA does not match the workflow run head SHA. Skipping.");
        return;
    }

    if (pr.head.ref !== run.head_branch) {
        core.info("PR head branch does not match the workflow run head branch. Skipping.");
        return;
    }

    if (pr.head.repo.full_name !== run.head_repository.full_name) {
        core.info("PR head repository fullname does not match the workflow run head repository fullname. Skipping.");
        return;
    }

    const comments = [];
    const ALL_REPORTS = fs.readFileSync(process.env.REPORTS_PATH, "utf8").trim().split("\n").filter(Boolean);
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
            core.error(`Failed to parse report line: "${report}". Error: ${error.message}`);
        }
    }

    if (comments.length === 0) {
        core.info("No diagnostics found to report as comments.");
        return;
    }

    core.info(`Successfully prepared ${comments.length} comment${comments.length > 1 ? "s" : ""} to post.`);

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
        core.info("Review comments successfully posted to the pull request.");
    } catch (error) {
        core.error(`Failed to post review comments to GitHub: ${error.message}`);
    }
}
