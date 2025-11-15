/**
 * @file src/commands/topics.ts
 * @description Lists the bundled topic catalog or replaces it with a remote/local JSON source so
 *              downstream commands operate on a deterministic topic set.
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from "node:fs";
import path from "node:path";
import {Command} from "commander";
import fetch from "node-fetch";
import {paths} from "../shared/paths";
import {Topic, writeTopics} from "../shared/topics";

interface TopicFeedRecord {
    id?: string;
    title?: string;
    ual?: string;
    wikipedia_slug?: string;
    grokipedia_slug?: string;
    wikipedia_url?: string;
    grokipedia_url?: string;
    wikipediaUrl?: string;
    grokipediaUrl?: string;
    links?: {
        wikipedia?: string;
        grokipedia?: string;
    };
    metadata?: Record<string, unknown>;
    category?: string;
}

const normalizeSlug = (value?: string | null): string | undefined => {
    if (!value) return undefined;
    return value.replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//i, "").replace(/^\/+/, "");
};

const normalizeGrokSlug = (value?: string | null): string | undefined => {
    if (!value) return undefined;
    return value.replace(/^https?:\/\/grokipedia\.com\//i, "").replace(/^\/+/, "");
};

const extractSlugFromLinks = (record: TopicFeedRecord, field: "wikipedia" | "grokipedia"): string | undefined => {
    const directSlug =
        field === "wikipedia" ? record.wikipedia_slug ?? record.wikipediaUrl?.split("/").pop() : record.grokipedia_slug;
    if (directSlug) {
        return field === "wikipedia" ? normalizeSlug(directSlug) : normalizeGrokSlug(directSlug);
    }
    const link =
        record.links?.[field] ??
        (field === "wikipedia" ? record.wikipedia_url ?? record.wikipediaUrl : record.grokipedia_url ?? record.grokipediaUrl);
    if (!link) return undefined;
    return field === "wikipedia" ? normalizeSlug(link) : normalizeGrokSlug(link);
};

const mapFeedRecordToTopic = (record: TopicFeedRecord, fallbackIndex: number): Topic | null => {
    const wikipediaSlug = extractSlugFromLinks(record, "wikipedia");
    const grokSlug = extractSlugFromLinks(record, "grokipedia");
    const rawTitle = record.title ?? record.metadata?.["title"];
    const title = typeof rawTitle === "string" ? rawTitle : undefined;
    if (!title || !wikipediaSlug || !grokSlug) {
        return null;
    }
    return {
        id: typeof record.id === "string" && record.id.length ? record.id : wikipediaSlug.toLowerCase() ?? `topic-${fallbackIndex}`,
        title,
        wikipedia_slug: wikipediaSlug,
        grokipedia_slug: grokSlug,
        ual: record.ual,
        category: record.category ?? (typeof record.metadata?.["category"] === "string" ? (record.metadata?.["category"] as string) : undefined)
    };
};

const parseTopicPayload = (payload: unknown): Topic[] => {
    const records: TopicFeedRecord[] = Array.isArray(payload)
        ? (payload as TopicFeedRecord[])
        : Array.isArray((payload as { topics?: TopicFeedRecord[] } | undefined)?.topics)
            ? ((payload as { topics: TopicFeedRecord[] }).topics)
            : [];
    const topics: Topic[] = [];
    records.forEach((record, idx) => {
        const topic = mapFeedRecordToTopic(record, idx);
        if (topic) {
            topics.push(topic);
        }
    });

    if (!topics.length) {
        throw new Error("No valid topics found in the provided payload.");
    }

    return topics;
};

const fetchTopicsFromFeed = async (url: string): Promise<Topic[]> => {
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json"
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch topic source (${response.status} ${response.statusText}).`);
    }
    const payload = await response.json();
    return parseTopicPayload(payload);
};

const readTopicsFromFile = (filePath: string): Topic[] => {
    const absolute = path.resolve(filePath);
    if (!fs.existsSync(absolute)) {
        throw new Error(`Topic source file not found: ${absolute}`);
    }
    const raw = fs.readFileSync(absolute, "utf8");
    const payload = JSON.parse(raw);
    return parseTopicPayload(payload);
};

const loadTopicsFromSource = async (source: string): Promise<Topic[]> => {
    if (/^https?:\/\//i.test(source)) {
        return fetchTopicsFromFeed(source);
    }
    return readTopicsFromFile(source);
};

const topicsCommand = new Command("topics").description("Topic catalog utilities");

const useBundledCatalog = (destination: string): void => {
    const bundledRaw = fs.readFileSync(paths.TOPICS, "utf8");
    const bundled = JSON.parse(bundledRaw) as Topic[];
    if (!bundled.length) throw new Error("Bundled topic catalog is empty.");

    if (destination !== paths.TOPICS) {
        fs.copyFileSync(paths.TOPICS, path.resolve(destination));
    }
    console.log(
        `[topics] Using bundled topic catalog (${bundled.length} topics) at ${destination}.`,
    );
};

topicsCommand
    .command("sync")
    .description("Copy the bundled topics.json or ingest a custom JSON source")
    .option("--source <path-or-url>", "Optional JSON feed (file path or https URL)")
    .option("--output <file>", "Where to write topics.json", paths.TOPICS)
    .action(async (options: { source?: string; output?: string }) => {
        const outputPath = options.output ?? paths.TOPICS;

        if (!options.source) {
            useBundledCatalog(outputPath);
            return;
        }

        try {
            const topics = await loadTopicsFromSource(options.source);
            writeTopics(topics);
            if (outputPath !== paths.TOPICS) {
                fs.copyFileSync(paths.TOPICS, path.resolve(outputPath));
            }
            console.log(`[topics] Synced ${topics.length} topics from ${options.source}`);
        } catch (error) {
            console.warn(`[topics] Failed to load source (${(error as Error).message}). Using bundled catalog.`);
            useBundledCatalog(outputPath);
        }
    });

export default topicsCommand;
