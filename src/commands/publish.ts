/**
 * @file src/commands/publish.ts
 * @description Publishes arbitrary JSON-LD payloads (Community Notes or otherwise) to a DKG node
 *              using the same signing workflow as `notes publish`.
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from "node:fs";
import path from "node:path";
import {Command} from "commander";
import chalk from "chalk";
import ora from "ora";

import {resolvePublishConfig} from "../shared/config";
import {publishJsonLdViaSdk} from "../lib/dkg";
import pkg from "../../package.json";

type PublishCLIOptions = {
    privacy?: string;
    endpoint?: string;
    environment?: string;
    port?: number;
    blockchain?: string;
    publicKey?: string;
    privateKey?: string;
    rpc?: string;
    epochs?: number;
    maxRetries?: number;
    pollFrequency?: number;
    dryRun?: boolean;
};

const loadJsonLdFile = (filePath: string) => {
    const absolute = path.resolve(filePath);
    if (!fs.existsSync(absolute)) {
        throw new Error(`File not found at '${absolute}'.`);
    }
    const raw = fs.readFileSync(absolute, "utf8");
    try {
        return JSON.parse(raw);
    } catch (error) {
        throw new Error(`Invalid JSON in '${absolute}': ${(error as Error).message}`);
    }
};

type JsonRecord = Record<string, unknown>;

const toJsonLdPayload = (parsed: unknown): unknown => {
    if (parsed && typeof parsed === "object") {
        const record = parsed as JsonRecord;
        const assetCandidate = record.asset;
        if (assetCandidate && typeof assetCandidate === "object") {
            return assetCandidate;
        }
        const jsonldCandidate = record.jsonld;
        if (jsonldCandidate && typeof jsonldCandidate === "object") {
            return jsonldCandidate;
        }
    }
    return parsed;
};

const publishCommand = new Command("publish")
    .description("Publish a JSON-LD Knowledge Asset from a file")
    .argument("<file>", "Path to the JSON-LD file to publish")
    .option("--privacy <mode>", "Specify asset privacy (public|private)", "private")
    .option("--endpoint <url>", "Override the DKG endpoint URL")
    .option("--environment <env>", "Override the DKG environment (devnet|testnet|mainnet|development)")
    .option("--port <number>", "Override the DKG node port", (value) => Number(value))
    .option("--blockchain <id>", "Specify blockchain identifier, e.g., hardhat1:31337")
    .option("--public-key <hex>", "Override the blockchain public key")
    .option("--private-key <hex>", "Override the blockchain private key")
    .option("--rpc <url>", "Provide a custom blockchain RPC URL")
    .option("--epochs <number>", "Number of epochs to retain the asset", (value) => Number(value))
    .option("--max-retries <number>", "Maximum publish polling retries", (value) => Number(value))
    .option("--poll-frequency <number>", "Seconds between publish polling attempts", (value) => Number(value))
    .option("--dry-run", "Print payload instead of publishing")
    .action(async (filePath: string, options: PublishCLIOptions) => {
        const config = resolvePublishConfig({
            endpoint: options.endpoint,
            environment: options.environment,
            port: options.port,
            blockchain: options.blockchain,
            publicKey: options.publicKey,
            privateKey: options.privateKey,
            rpcUrl: options.rpc,
            epochsNum: options.epochs,
            maxRetries: options.maxRetries,
            frequencySeconds: options.pollFrequency,
            dryRun: options.dryRun
        });

        const rawJson = loadJsonLdFile(filePath);
        const jsonld = toJsonLdPayload(rawJson);
        if (!jsonld || typeof jsonld !== "object") {
            throw new Error("The provided file does not contain a valid JSON-LD object.");
        }

        const privacy = (options.privacy ?? "private").toLowerCase();
        if (!["public", "private"].includes(privacy)) {
            throw new Error("Privacy must be either 'public' or 'private'.");
        }

        console.log(
            chalk.cyan(
                `Publishing Knowledge Asset from '${filePath}' via DKG SDK (${config.endpoint}:${config.port}) (privacy: ${privacy})...`
            )
        );

        const dryRun = options.dryRun ?? config.dryRun;
        if (dryRun) {
            console.log(chalk.yellow("Dry-run enabled. Payload below:"));
            console.log(JSON.stringify(jsonld, null, 2));
            return;
        }

        const maxSeconds = config.maxRetries * config.frequencySeconds;
        const spinner = ora(
            `Publishing via ${config.endpoint}:${config.port} (polling up to ${maxSeconds}s)`
        ).start();

        try {
            const result = await publishJsonLdViaSdk(jsonld as Record<string, unknown>, {
                endpoint: config.endpoint,
                port: config.port,
                environment: config.environment,
                blockchain: {
                    name: config.blockchain,
                    publicKey: config.publicKey,
                    privateKey: config.privateKey,
                    rpc: config.rpcUrl,
                },
                epochsNum: config.epochsNum,
                maxNumberOfRetries: config.maxRetries,
                frequencySeconds: config.frequencySeconds,
                privacy: privacy as "public" | "private",
            });

            const publishStatus = (result.raw as {
                operation?: { publish?: { status?: string; errorMessage?: string } }
            }).operation?.publish;
            const statusLabel = publishStatus?.status?.toUpperCase();
            const publishCompleted =
                statusLabel === "COMPLETED" || statusLabel === "PUBLISH_REPLICATE_END" || (!!result.ual && !statusLabel);

            if (!publishCompleted) {
                const reason = publishStatus?.errorMessage ?? publishStatus?.status ?? "DKG publish did not complete.";
                spinner.fail(`DKG publish failed: ${reason}`);
                process.exitCode = 1;
                return;
            }

            spinner.succeed("Knowledge Asset published successfully.");
            if (result.ual) {
                console.log(chalk.bold(`UAL: ${result.ual}`));
            }
            const datasetRoot = (result.raw as { datasetRoot?: unknown }).datasetRoot;
            if (typeof datasetRoot === "string") {
                console.log(chalk.gray(`datasetRoot: ${datasetRoot}`));
            }
            console.log(chalk.gray(`CLI: civiclens-cli@${pkg.version}`));
        } catch (error) {
            spinner.fail("DKG publish failed.");
            console.error(chalk.red("Error publishing asset:"), (error as Error).message);
            process.exitCode = 1;
        }
    });

export default publishCommand;
