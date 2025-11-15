/**
 * @file src/commands/notes.ts
 * @description Builds Community Notes JSON-LD payloads from analyzer output, updates the notes index,
 *              and publishes notes to the DKG (build/publish/subcommands).
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from "node:fs";
import path from "node:path";
import {Command} from "commander";
import {paths} from "../shared/paths";
import {loadTopics, Topic} from "../shared/topics";
import {buildCommunityNote, BuildNoteOptions} from "../lib/notes";
import {loadNoteEntry, upsertNoteIndexEntry} from "../shared/notes";
import {publishJsonLdViaSdk} from "../lib/dkg";
import {resolvePublishConfig} from "../shared/config";
import ora from "ora";
import {coerceStructuredAnalysisReport, StructuredAnalysisReport} from "../lib/structured-report";

interface BuildCLIOptions {
    topic: string;
    summary?: string;
    accuracy?: string;
    completeness?: string;
    toneBias?: string;
    stakeToken?: string;
    stakeAmount?: string;
    reviewerName?: string;
    reviewerId?: string;
}

const readAnalysis = (topic: Topic): StructuredAnalysisReport => {
    const filePath = path.join(paths.ANALYSIS_DIR, `${topic.id}.json`);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing analysis file ${filePath}. Run 'civiclens analyse --topic ${topic.id}' first.`);
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as StructuredAnalysisReport | Record<string, unknown>;
    return coerceStructuredAnalysisReport(topic, parsed as StructuredAnalysisReport);
};

const writeNoteFile = (topic: Topic, payload: Record<string, unknown>): string => {
    fs.mkdirSync(paths.NOTES_DIR, {recursive: true});
    const target = path.join(paths.NOTES_DIR, `${topic.id}.json`);
    fs.writeFileSync(target, JSON.stringify(payload, null, 2), "utf8");
    return target;
};

const parseNumber = (value?: string): number | undefined => {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
};

const notesCommand = new Command("notes").description("Community Note helpers");

notesCommand
    .command("build")
    .description("Generate or update the JSON-LD Community Note for a topic")
    .requiredOption("-t, --topic <id>", "Topic identifier")
    .option("--summary <text>", "Override the auto-generated summary")
    .option("--accuracy <score>", "Accuracy score 0-5")
    .option("--completeness <score>", "Completeness score 0-5")
    .option("--tone-bias <score>", "Tone/bias score 0-5")
    .option("--stake-token <symbol>", "Token symbol for trust stake", "TRAC")
    .option("--stake-amount <number>", "Stake amount", "0")
    .option("--reviewer-name <string>", "Reviewer/organization name", "CivicLens")
    .option("--reviewer-id <string>", "Reviewer DID/identifier")
    .action((options: BuildCLIOptions) => {
        const topics = loadTopics();
        const topic = topics[options.topic];
        if (!topic) {
            throw new Error(`Unknown topic '${options.topic}'.`);
        }
        const analysis = readAnalysis(topic);
        const note = buildCommunityNote(topic, analysis, {
            summary: options.summary,
            accuracy: parseNumber(options.accuracy),
            completeness: parseNumber(options.completeness),
            toneBias: parseNumber(options.toneBias),
            stakeToken: options.stakeToken,
            stakeAmount: parseNumber(options.stakeAmount),
            reviewerName: options.reviewerName,
            reviewerId: options.reviewerId
        } as BuildNoteOptions);

        const filePath = writeNoteFile(topic, note);
        upsertNoteIndexEntry(topic.id, (existing) => ({
            topic_id: topic.id,
            topic_title: topic.title,
            file: path.basename(filePath),
            status: existing?.status === "published" ? "published" : "draft",
            analysis_file: `../analysis/${topic.id}.json`,
            generated_at: new Date().toISOString(),
            published_at: existing?.published_at ?? null,
            ual: existing?.ual ?? null,
            stake: {
                token: options.stakeToken || "TRAC",
                amount: parseNumber(options.stakeAmount) ?? 0
            }
        }));

        console.log(`[notes] Built Community Note for ${topic.id} at ${filePath}`);
    });

notesCommand
    .command("publish")
    .description("Publish a Community Note via the DKG SDK (or record an existing UAL)")
    .requiredOption("-t, --topic <id>", "Topic identifier")
    .option("--ual <ual>", "Use a manually obtained UAL instead of calling the DKG node")
    .option("--endpoint <url>", "Override DKG node URL")
    .option("--environment <env>", "Override DKG environment (devnet|testnet|mainnet|development)")
    .option("--port <number>", "Override DKG node port", (value) => Number(value))
    .option("--blockchain <id>", "Override blockchain identifier (e.g., hardhat1:31337)")
    .option("--private-key <hex>", "Override blockchain private key")
    .option("--public-key <hex>", "Override blockchain public key")
    .option("--rpc <url>", "Override blockchain RPC URL")
    .option("--epochs <number>", "Override default publish epochs", (value) => Number(value))
    .option("--max-retries <number>", "Maximum publish polling retries", (value) => Number(value))
    .option("--poll-frequency <number>", "Seconds between publish polling attempts", (value) => Number(value))
    .option("--dry-run", "Skip publish and print payload")
    .action(async (options: {
        topic: string;
        ual?: string;
        endpoint?: string;
        environment?: string;
        port?: number;
        blockchain?: string;
        privateKey?: string;
        publicKey?: string;
        rpc?: string;
        epochs?: number;
        maxRetries?: number;
        pollFrequency?: number;
        dryRun?: boolean;
    }) => {
        const { entry, note } = loadNoteEntry(options.topic);
        if (!entry) {
            console.error(`[notes] No note entry found for '${options.topic}'. Run 'civiclens notes build' first.`);
            process.exitCode = 1;
            return;
        }
        if (!note) {
            console.error(`[notes] Note file '${entry.file}' is missing. Re-run 'civiclens notes build'.`);
            process.exitCode = 1;
            return;
        }
        let spinner: ora.Ora | undefined;

        try {

            let ual: string | null = options.ual ?? null;
            let rawResponse: unknown;

            if (!ual) {
                const publishConfig = resolvePublishConfig({
                    endpoint: options.endpoint,
                    environment: options.environment,
                    port: options.port,
                    blockchain: options.blockchain,
                    privateKey: options.privateKey,
                    publicKey: options.publicKey,
                    rpcUrl: options.rpc,
                    epochsNum: options.epochs,
                    maxRetries: options.maxRetries,
                    frequencySeconds: options.pollFrequency,
                    dryRun: options.dryRun
                });

                const dryRun = options.dryRun ?? publishConfig.dryRun;
                if (dryRun) {
                    console.log(`[notes] Dry-run enabled for ${options.topic}. Payload:`);
                    console.log(JSON.stringify(note, null, 2));
                } else {
                    const maxSeconds = publishConfig.maxRetries * publishConfig.frequencySeconds;
                    spinner = ora(
                        `[notes] Publishing via ${publishConfig.endpoint}:${publishConfig.port} (polling up to ${maxSeconds}s)`
                    ).start();
                    const result = await publishJsonLdViaSdk(note as Record<string, unknown>, {
                        endpoint: publishConfig.endpoint,
                        port: publishConfig.port,
                        blockchain: {
                            name: publishConfig.blockchain,
                            publicKey: publishConfig.publicKey,
                            privateKey: publishConfig.privateKey,
                            rpc: publishConfig.rpcUrl
                        },
                        epochsNum: publishConfig.epochsNum,
                        maxNumberOfRetries: publishConfig.maxRetries,
                        frequencySeconds: publishConfig.frequencySeconds,
                        privacy: "private"
                    });

                    ual = result.ual;
                    rawResponse = result.raw;
                    const publishStatus = (rawResponse as {
                        operation?: { publish?: { status?: string; errorMessage?: string } }
                    }).operation?.publish;
                    const statusLabel = publishStatus?.status?.toUpperCase();
                    const publishCompleted =
                        statusLabel === "COMPLETED" || statusLabel === "PUBLISH_REPLICATE_END" || (!!ual && !statusLabel);

                    if (!publishCompleted) {
                        const reason = publishStatus?.errorMessage ?? publishStatus?.status ?? "DKG publish did not complete.";
                        spinner?.fail(`[notes] DKG publish failed: ${reason}`);
                        process.exitCode = 1;
                        return;
                    }

                    spinner?.succeed(
                        ual ? `[notes] DKG publish completed. UAL: ${ual}` : "[notes] DKG publish completed. UAL not included in response."
                    );
                }
            } else {
                console.log(`[notes] Recording provided UAL for ${options.topic}: ${ual}`);
            }

            upsertNoteIndexEntry(options.topic, () => ({
                ...entry,
                status: "published",
                ual,
                published_at: new Date().toISOString()
            }));

            if (rawResponse) {
                const logPath = path.join(paths.NOTES_DIR, `${options.topic}.publish.log.json`);
                fs.writeFileSync(logPath, JSON.stringify(rawResponse, null, 2), "utf8");
                console.log(`[notes] Saved DKG response to ${logPath}`);
            }
        } catch (error) {
            const message = (error as Error).message?.trim() || "Unknown error";
            spinner?.fail(`[notes] DKG publish failed: ${message}`);
            console.error(`[notes] Publish failed: ${message}`);
            process.exitCode = 1;
        }
    });

export default notesCommand;
