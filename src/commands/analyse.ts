/**
 * @file src/commands/analyse.ts
 * @description Compares the structured snapshots for a topic, computes similarity metrics,
 *              and writes `analysis/<topic>.json` (plus optional Gemini summaries/verification and
 *              citation-backed hallucination checks).
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from "node:fs";
import path from "node:path";
import {Command} from "commander";
import ora from "ora";
import {paths} from "../shared/paths";
import {loadTopics, selectTopics, Topic} from "../shared/topics";
import {AnalysisPayload, analyzeContent, type AnalyzerSource, prepareAnalyzerSource} from "../lib/analyzer";
import type {StructuredArticle} from "../lib/wiki-structured";
import {computeContentHash} from "../shared/content-hash";
import {probeCachedAnalysis} from "../shared/analysis-cache";
import {GEMINI_DEFAULT_MODEL, verifyBiasWithGemini} from "../lib/bias-verifier";
import {generateGeminiComparisonSummary} from "../lib/gemini-summary";
import {verifySentencesAgainstCitations} from "../lib/citation-verifier";
import {readConfig} from "../shared/config";
import {buildStructuredAnalysis} from "../lib/structured-report";

interface TopicContext {
    wikiSource: AnalyzerSource;
    grokSource: AnalyzerSource;
    contentHash: string;
    analysisPath: string;
}

const readStructuredArticle = (dir: string, topic: Topic, source: "wiki" | "grok"): StructuredArticle => {
    const target = path.join(dir, `${topic.id}.parsed.json`);
    if (!fs.existsSync(target)) {
        const label = source === "wiki" ? "wiki" : "grok";
        throw new Error(`Missing structured snapshot ${target}. Run 'civiclens fetch ${label} --topic ${topic.id}' first.`);
    }
    const raw = fs.readFileSync(target, "utf8");
    return JSON.parse(raw) as StructuredArticle;
};

const buildTopicContext = (topic: Topic): TopicContext => {
    const wikiArticle = readStructuredArticle(paths.WIKI_DIR, topic, "wiki");
    const grokArticle = readStructuredArticle(paths.GROK_DIR, topic, "grok");
    const wikiSource = prepareAnalyzerSource(wikiArticle);
    const grokSource = prepareAnalyzerSource(grokArticle);
    const contentHash = computeContentHash(wikiArticle.text, grokArticle.text);
    return {
        wikiSource,
        grokSource,
        contentHash,
        analysisPath: path.join(paths.ANALYSIS_DIR, `${topic.id}.json`)
    };
};

const analyzeTopicSync = (topic: Topic, force: boolean | undefined, context: TopicContext): AnalysisPayload | null => {
    if (!force) {
        const cached = probeCachedAnalysis(context.analysisPath, context.contentHash);
        if (cached.status === "fresh" && cached.analysis) {
            const cachedTimestamp =
                (cached.analysis as { generated_at?: string }).generated_at ??
                (cached.analysis as { updated_at?: string }).updated_at ??
                "cached";
            console.log(`[analyse] ${topic.id}: reused cached analysis (${cachedTimestamp})`);
            return null;
        }
        if (cached.status !== "missing" && cached.status !== "fresh" && cached.reason) {
            console.log(`[analyse] ${topic.id}: regenerating analysis (${cached.reason})`);
        }
    }

    return analyzeContent(topic, context.wikiSource, context.grokSource, {contentHash: context.contentHash});
};

const analyzeTopicAsync = (topic: Topic, force: boolean | undefined, context: TopicContext): Promise<AnalysisPayload | null> =>
    new Promise((resolve, reject) => {
        setImmediate(() => {
            try {
                resolve(analyzeTopicSync(topic, force, context));
            } catch (error) {
                reject(error);
            }
        });
    });

interface BiasVerifierConfig {
    provider: "gemini";
    apiKey: string;
    model: string;
}

interface GeminiSummaryConfig {
    apiKey: string;
    model: string;
}

const runAnalyse = async (
    topicId?: string,
    force?: boolean,
    verifier?: BiasVerifierConfig | null,
    summary?: GeminiSummaryConfig | null,
    verifyCitations?: boolean
): Promise<void> => {
    const topics = loadTopics();
    const selection = selectTopics(topics, topicId);
    paths.ensureDir(paths.ANALYSIS_DIR);

    for (const topic of selection) {
        const spinner = ora(`[analyse] ${topic.id}: analyzing`).start();
        let context: TopicContext;
        try {
            context = buildTopicContext(topic);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            spinner.fail(`[analyse] ${topic.id}: ${message}`);
            continue;
        }
        try {
            const analysis = await analyzeTopicAsync(topic, force, context);
            if (!analysis) {
                spinner.succeed(`[analyse] ${topic.id}: reused cached analysis`);
                continue;
            }
            if (verifier?.provider === "gemini" && analysis.bias_events.length > 0) {
                analysis.bias_verifications = await verifyBiasWithGemini({
                    apiKey: verifier.apiKey,
                    model: verifier.model ?? GEMINI_DEFAULT_MODEL,
                    events: analysis.bias_events,
                    wikiText: context.wikiSource.text,
                    grokText: context.grokSource.text
                });
            }
            if (summary) {
                analysis.gemini_summary = await generateGeminiComparisonSummary({
                    apiKey: summary.apiKey,
                    model: summary.model,
                    wikiText: context.wikiSource.text,
                    grokText: context.grokSource.text
                });
            }
            if (verifyCitations && analysis.extra_sentences.length) {
                const citationResults = await verifySentencesAgainstCitations(analysis.extra_sentences, context.grokSource.content.citations ?? []);
                analysis.citation_verifications = citationResults;
                analysis.hallucination_events = analysis.hallucination_events ?? [];
                citationResults
                    .filter((entry) => entry.status === "unsupported")
                    .forEach((entry) => {
                        analysis.hallucination_events.push({
                            type: "hallucination",
                            description: "Sentence is not supported by cited sources (auto-check).",
                            evidence: {grokipedia: entry.sentence},
                            category: "hallucination",
                            severity: 4,
                            tags: ["unsupported_citation"]
                        });
                    });
            }
            const structured = buildStructuredAnalysis(topic, analysis);
            fs.writeFileSync(context.analysisPath, JSON.stringify(structured, null, 2), "utf8");
            spinner.succeed(`[analyse] ${topic.id}: wrote ${context.analysisPath}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            spinner.fail(`[analyse] ${topic.id}: ${message}`);
        }
    }
};

interface AnalyseCliOptions {
    topic?: string;
    force?: boolean;
    biasVerifier?: string;
    geminiKey?: string;
    geminiModel?: string;
    geminiSummary?: boolean;
    verifyCitations?: boolean;
}

const resolveBiasVerifierOptions = (options: AnalyseCliOptions): BiasVerifierConfig | null => {
    if (!options.biasVerifier) {
        return null;
    }
    const provider = options.biasVerifier.toLowerCase();
    if (provider !== "gemini") {
        throw new Error(`Unsupported bias verifier '${options.biasVerifier}'.`);
    }
    const cfg = readConfig();
    const apiKey = options.geminiKey ?? cfg.geminiApiKey;
    if (!apiKey) {
        throw new Error("Set --gemini-key or configure geminiApiKey in .civiclensrc.json before using --bias-verifier gemini.");
    }
    return {
        provider: "gemini",
        apiKey,
        model: options.geminiModel ?? cfg.geminiModel ?? GEMINI_DEFAULT_MODEL
    };
};

const resolveGeminiSummaryOptions = (options: AnalyseCliOptions): GeminiSummaryConfig => {
    const cfg = readConfig();
    const apiKey = options.geminiKey ?? cfg.geminiApiKey;
    if (!apiKey) {
        throw new Error("Set --gemini-key or configure geminiApiKey in .civiclensrc.json before enabling --gemini-summary.");
    }
    return {
        apiKey,
        model: options.geminiModel ?? cfg.geminiModel ?? GEMINI_DEFAULT_MODEL
    };
};

const analyseCommand = new Command("analyse")
    .description("Generate comparison JSON between Grokipedia and Wikipedia content")
    .option("-t, --topic <id>", "Topic identifier (default: all topics)")
    .option("-f, --force", "Ignore cached analysis results and recompute")
    .option("--bias-verifier <provider>", "Verify bias events with an external provider (e.g., gemini)")
    .option("--gemini-key <key>", "API key for the Gemini provider (falls back to GEMINI_API_KEY)")
    .option("--gemini-model <model>", `Gemini model identifier (default: ${GEMINI_DEFAULT_MODEL})`)
    .option("--gemini-summary", "Generate a Gemini-authored comparison summary")
    .option("--verify-citations", "Fetch Grokipedia citations and confirm extra sentences are supported")
    .action(async (options: AnalyseCliOptions) => {
        const verifier = resolveBiasVerifierOptions(options);
        const summary = options.geminiSummary ? resolveGeminiSummaryOptions(options) : null;
        await runAnalyse(options.topic, options.force, verifier, summary, options.verifyCitations);
    });

export default analyseCommand;
