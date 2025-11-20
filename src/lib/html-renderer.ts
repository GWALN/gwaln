/**
 * @file src/lib/html-renderer.ts
 * @description HTML rendering functions for analysis reports
 * @author Doğu Abaris <abaris@null.net>
 */

import type { DiscrepancyRecord } from './analyzer';
import type { StructuredAnalysisReport } from './structured-report';
import { render } from './template-renderer';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatPercent = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`;

const formatSnippet = (value: string): string =>
  value.length > 160 ? `${value.slice(0, 160)}…` : value;

export const renderList = (title: string, items: string[], modalId: string): string => {
  if (!items.length) return '';
  const displayCount = Math.min(3, items.length);
  const listItems = items
    .slice(0, displayCount)
    .map((item) => `<li>${escapeHtml(formatSnippet(item))}</li>`)
    .join('');
  const hasMore = items.length > displayCount;
  const allItems = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  const viewMoreBtn = hasMore
    ? `<button class="view-more-btn" onclick="openModal('${modalId}')">View All <span class="count-badge">${items.length}</span></button>`
    : '';

  const modal = hasMore
    ? `
<div id="${modalId}" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>${escapeHtml(title)}</h3>
      <button class="close-btn" onclick="closeModal('${modalId}')">&times;</button>
    </div>
    <div class="modal-body">
      <ul>${allItems}</ul>
    </div>
  </div>
</div>`
    : '';

  return `<section class="card">
  <div class="card-title">${escapeHtml(title)}</div>
  <ul class="compact-list">${listItems}</ul>
  ${viewMoreBtn}
</section>${modal}`;
};

export const renderAlignmentTable = (analysis: StructuredAnalysisReport): string => {
  const allRows = analysis.comparison.sections.alignment;
  if (!allRows.length) return '';

  const displayCount = Math.min(3, allRows.length);
  const hasMore = allRows.length > displayCount;

  const renderAlignmentRow = (record: (typeof allRows)[0]) => {
    const similarity = record.similarity * 100;
    const barColor = similarity >= 80 ? '#10b981' : similarity >= 50 ? '#f59e0b' : '#ef4444';

    return `<div class="alignment-row">
      <div class="alignment-sections">
        <div class="alignment-section">
          <span class="section-label">Wiki</span>
          <span class="section-heading">${escapeHtml(record.wikipedia?.heading ?? '-')}</span>
        </div>
        <div class="alignment-arrow">→</div>
        <div class="alignment-section">
          <span class="section-label">Grok</span>
          <span class="section-heading">${escapeHtml(record.grokipedia?.heading ?? '-')}</span>
        </div>
      </div>
      <div class="similarity-bar-container">
        <div class="similarity-bar" style="width: ${similarity}%; background: ${barColor};"></div>
        <span class="similarity-value">${formatPercent(record.similarity)}</span>
      </div>
    </div>`;
  };

  const compactList = allRows.slice(0, displayCount).map(renderAlignmentRow).join('');
  const fullList = allRows.map(renderAlignmentRow).join('');

  const viewMoreBtn = hasMore
    ? `<button class="view-more-btn" onclick="openModal('modal-section-alignment')">View All <span class="count-badge">${allRows.length}</span></button>`
    : '';

  const modal = hasMore
    ? `
<div id="modal-section-alignment" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Section Alignment</h3>
      <button class="close-btn" onclick="closeModal('modal-section-alignment')">&times;</button>
    </div>
    <div class="modal-body">
      ${fullList}
    </div>
  </div>
</div>`
    : '';

  return `<section class="card">
  <div class="card-title">Section Alignment</div>
  <div class="alignment-list">
    ${compactList}
  </div>
  ${viewMoreBtn}
</section>${modal}`;
};

export const renderDiscrepancyList = (
  title: string,
  issues: DiscrepancyRecord[],
  modalId: string,
): string => {
  if (!issues.length) return '';
  const displayCount = Math.min(3, issues.length);
  const hasMore = issues.length > displayCount;

  const renderIssue = (issue: DiscrepancyRecord, idx: number, showEvidence: boolean) => {
    const evidence = issue.evidence ?? {};
    const wiki =
      showEvidence && evidence.wikipedia
        ? `<div class="evidence"><strong>Wikipedia</strong>: ${escapeHtml(formatSnippet(evidence.wikipedia))}</div>`
        : '';
    const grok =
      showEvidence && evidence.grokipedia
        ? `<div class="evidence"><strong>Grokipedia</strong>: ${escapeHtml(formatSnippet(evidence.grokipedia))}</div>`
        : '';
    return `<li>
  <span class="issue-label">${idx + 1}. [${escapeHtml(issue.type)}]</span> ${escapeHtml(issue.description ?? '')}
  ${wiki}${grok}
</li>`;
  };

  const compactList = issues
    .slice(0, displayCount)
    .map((issue, idx) => renderIssue(issue, idx, false))
    .join('');
  const fullList = issues.map((issue, idx) => renderIssue(issue, idx, true)).join('');

  const viewMoreBtn = hasMore
    ? `<button class="view-more-btn" onclick="openModal('${modalId}')">View All <span class="count-badge">${issues.length}</span></button>`
    : '';

  const modal = hasMore
    ? `
<div id="${modalId}" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>${escapeHtml(title)}</h3>
      <button class="close-btn" onclick="closeModal('${modalId}')">&times;</button>
    </div>
    <div class="modal-body">
      <ol>${fullList}</ol>
    </div>
  </div>
</div>`
    : '';

  return `<section class="card">
  <div class="card-title">${escapeHtml(title)}</div>
  <ul class="compact-list">${compactList}</ul>
  ${viewMoreBtn}
</section>${modal}`;
};

export const renderBiasPanel = (analysis: StructuredAnalysisReport): string => {
  const metrics = analysis.bias_metrics;
  const listLoadedTerms = (entries: Record<string, number>): string => {
    if (!entries || !Object.keys(entries).length) return '';
    return Object.entries(entries)
      .slice(0, 6)
      .map(
        ([term, count]) =>
          `<span style="background: #00EB5E; border: 1px solid #00EB5E; color: #221C46; padding: 0.25rem 0.5rem; border-radius: 999px; font-size: 0.65rem; font-weight: 600; display: inline-block; margin: 0.25rem;">${escapeHtml(term)} <span style="background: #221C46; color: white; padding: 0.125rem 0.375rem; border-radius: 999px; font-size: 0.6rem; font-weight: 600; margin-left: 0.25rem;">${count}</span></span>`,
      )
      .join('');
  };

  const grokTerms = listLoadedTerms(metrics.loaded_terms_grok);
  const wikiTerms = listLoadedTerms(metrics.loaded_terms_wiki);

  return `<div style="background: white; border: 1px solid #e9ecef; border-radius: 8px; padding: 1rem;">
  <div style="font-size: 0.75rem; font-weight: 600; color: #221C46; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; padding-bottom: 0.375rem; border-bottom: 2px solid #00EB5E;">Bias Metrics</div>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
    <div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 0.75rem; border-radius: 6px; text-align: center;">
      <p style="font-size: 0.65rem; color: #6c757d; margin-bottom: 0.375rem; text-transform: uppercase; letter-spacing: 0.05em;">Subjectivity</p>
      <strong style="display: block; font-size: 2rem; color: #221C46;">${metrics.subjectivity_delta.toFixed(3)}</strong>
    </div>
    <div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 0.75rem; border-radius: 6px; text-align: center;">
      <p style="font-size: 0.65rem; color: #6c757d; margin-bottom: 0.375rem; text-transform: uppercase; letter-spacing: 0.05em;">Polarity</p>
      <strong style="display: block; font-size: 2rem; color: #221C46;">${metrics.polarity_delta.toFixed(3)}</strong>
    </div>
  </div>
  ${grokTerms ? `<div style="margin-bottom: 0.5rem;"><p style="font-size: 0.65rem; color: #6c757d; margin-bottom: 0.375rem; text-transform: uppercase; letter-spacing: 0.05em;">Grokipedia Terms</p><div>${grokTerms}</div></div>` : ''}
  ${wikiTerms ? `<div><p style="font-size: 0.65rem; color: #6c757d; margin-bottom: 0.375rem; text-transform: uppercase; letter-spacing: 0.05em;">Wikipedia Terms</p><div>${wikiTerms}</div></div>` : ''}
</div>`;
};

export const renderDiffSampleButton = (analysis: StructuredAnalysisReport): string => {
  const diffLines = analysis.attachments.diff_sample ?? [];
  if (!diffLines.length) return '';

  const modal = `
<div id="modal-diff-sample" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Text Diff Sample</h3>
      <button class="close-btn" onclick="closeModal('modal-diff-sample')">&times;</button>
    </div>
    <div class="modal-body">
      <pre style="background: #f8f9fa; color: #212529; padding: 1rem; border-radius: 6px; font-size: 0.75rem; font-family: 'JetBrains Mono', monospace; overflow-x: auto; line-height: 1.5; border: 1px solid #e9ecef;">${escapeHtml(diffLines.join('\n'))}</pre>
    </div>
  </div>
</div>`;

  return `<button class="diff-button" onclick="openModal('modal-diff-sample')">View Diff Sample</button>${modal}`;
};

export const renderVerifications = (analysis: StructuredAnalysisReport): string => {
  const citationChecks = analysis.attachments.citation_verifications ?? [];
  const biasChecks = analysis.attachments.bias_verifications ?? [];
  const blocks: string[] = [];
  if (citationChecks.length) {
    const list = citationChecks
      .slice(0, 10)
      .map(
        (entry) => `<li>
  <strong class="status-${escapeHtml(entry.status)}">[${escapeHtml(entry.status)}]</strong> ${escapeHtml(formatSnippet(entry.sentence ?? ''))}
  ${entry.supporting_url ? `<div class="evidence">${escapeHtml(entry.supporting_url)}</div>` : ''}
  ${entry.message ? `<div class="evidence">${escapeHtml(entry.message)}</div>` : ''}
</li>`,
      )
      .join('');
    blocks.push(
      `<section class="card">
  <div class="card-title">Citation Verification</div>
  <ul>${list}</ul>
</section>`,
    );
  }
  if (biasChecks.length) {
    const list = biasChecks
      .slice(0, 10)
      .map(
        (entry) => `<li>
  <strong>${escapeHtml(entry.provider)}</strong> · ${escapeHtml(entry.verdict)}
  ${entry.confidence ? `<span class="muted">(confidence ${escapeHtml(String(entry.confidence))})</span>` : ''}
  ${entry.rationale ? `<div class="evidence">${escapeHtml(formatSnippet(entry.rationale))}</div>` : ''}
</li>`,
      )
      .join('');
    blocks.push(
      `<section class="card">
  <div class="card-title">Bias Verification</div>
  <ul>${list}</ul>
</section>`,
    );
  }
  return blocks.join('');
};

export const renderSimilarSentencesModal = (analysis: StructuredAnalysisReport): string => {
  const reworded = analysis.comparison.sentences.reworded;
  const agreed = analysis.comparison.sentences.agreed;

  if (!reworded.length && !agreed.length) return '';

  const rewordedItems = reworded
    .slice(0, 20)
    .map(
      (
        item,
      ) => `<li style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border);">
  <div style="margin-bottom: 0.5rem;">
    <strong style="color: var(--color-purple); font-size: 0.7rem;">Wikipedia:</strong>
    <div style="font-size: 0.75rem; color: var(--color-text); margin-top: 0.25rem;">${escapeHtml(item.wikipedia)}</div>
  </div>
  <div style="margin-bottom: 0.5rem;">
    <strong style="color: var(--color-purple); font-size: 0.7rem;">Grokipedia:</strong>
    <div style="font-size: 0.75rem; color: var(--color-text); margin-top: 0.25rem;">${escapeHtml(item.grokipedia)}</div>
  </div>
  <div style="font-size: 0.65rem; color: var(--color-text-muted);">
    Similarity: ${formatPercent(item.similarity)}
  </div>
</li>`,
    )
    .join('');

  const agreedItems = agreed
    .map(
      (sentence) =>
        `<li style="padding: 0.75rem; margin-bottom: 0.5rem; background: linear-gradient(90deg, rgba(204, 243, 129, 0.3) 0%, rgba(204, 243, 129, 0.1) 100%); border-left: 3px solid var(--color-green); border-radius: 4px; font-size: 0.8rem; line-height: 1.5; color: var(--color-text);">${escapeHtml(sentence)}</li>`,
    )
    .join('');

  return `
<div id="modal-similar-sentences" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Similar & Aligned Content</h3>
      <button class="close-btn" onclick="closeModal('modal-similar-sentences')">&times;</button>
    </div>
    <div class="modal-body">
      ${
        agreed.length
          ? `
        <h4 style="font-size: 0.85rem; color: var(--color-purple); margin-bottom: 0.75rem; font-weight: 600;">Identical Sentences (${agreed.length})</h4>
        <p style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 1rem;">These sentences appear exactly the same in both Wikipedia and Grokipedia:</p>
        <ul style="list-style: none; padding: 0; margin-bottom: 2rem;">${agreedItems}</ul>
      `
          : ''
      }
      ${
        reworded.length
          ? `
        <h4 style="font-size: 0.85rem; color: var(--color-purple); margin-bottom: 0.75rem; font-weight: 600;">Reworded Sentences (${reworded.length})</h4>
        <ul style="list-style: none; padding: 0;">${rewordedItems}</ul>
      `
          : ''
      }
    </div>
  </div>
</div>`;
};

export const renderNoteInfoLogo = (_notePayload: {
  entry: { status?: string; file: string; ual?: string | null } | null;
  note: Record<string, unknown> | null;
}): string => {
  return `<div style="margin-bottom: 0.5rem;">
  <img src="gwaln-logo.svg" alt="GWALN" style="height: 32px; width: auto;" />
</div>`;
};

export const renderNoteInfo = (
  notePayload: {
    entry: { status?: string; file: string; ual?: string | null } | null;
    note: Record<string, unknown> | null;
  },
  wikiUrl: string,
  grokUrl: string,
): string => {
  const entry = notePayload?.entry;
  const note = notePayload?.note;

  const isPublished = entry && note && entry.status === 'published';
  const statusBadge = isPublished
    ? `<div style="background: #00EB5E; color: #221C46; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.7rem; font-weight: 600;">
        Published | UAL: ${entry.ual ? escapeHtml(entry.ual) : 'N/A'}
      </div>`
    : `<div style="background: #6c757d; color: #ffffff; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.7rem; font-weight: 600;">
        Not published yet
      </div>`;

  return `<div style="display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem; flex-wrap: wrap;">
  ${statusBadge}
  <div style="display: flex; gap: 1rem;">
    <a href="${escapeHtml(wikiUrl)}" target="_blank" rel="noopener" style="color: #221C46; text-decoration: none; font-size: 0.75rem; font-weight: 600; transition: opacity 0.2s;">Wikipedia →</a>
    <a href="${escapeHtml(grokUrl)}" target="_blank" rel="noopener" style="color: #221C46; text-decoration: none; font-size: 0.75rem; font-weight: 600; transition: opacity 0.2s;">Grokipedia →</a>
  </div>
</div>`;
};

export const renderHtmlReport = (
  analysis: StructuredAnalysisReport,
  notePayload: {
    entry: { status?: string; file: string; ual?: string | null } | null;
    note: Record<string, unknown> | null;
  },
  notesIndexUpdatedAt: string | null,
): string => {
  const { topic, summary, comparison, discrepancies, meta } = analysis;
  const totalSentences = summary.sentences_reviewed;

  const hasSimilarContent =
    comparison.sentences.reworded.length > 0 || comparison.sentences.agreed.length > 0;

  const score = summary.confidence.score;
  const label = summary.confidence.label;
  const actualValue = Math.min(100, Math.max(0, score * 100));

  let meterColor = '#dc3545';

  if (score >= 0.9) {
    meterColor = '#28a745';
  } else if (score >= 0.7) {
    meterColor = '#00EB5E';
  } else if (score >= 0.5) {
    meterColor = '#ffc107';
  } else if (score >= 0.2) {
    meterColor = '#fd7e14';
  }

  const confidenceMeter = `<div style="padding: 1.25rem;width: 400px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
      <span style="font-size: 1.75rem; font-weight: 600; color: #6c757d; text-transform: uppercase; letter-spacing: 0.05em;">Confidence</span>
      <span style="font-size: 2rem; font-weight: 700; color: ${meterColor};">${actualValue.toFixed(0)}%</span>
    </div>
    <div style="position: relative; height: 10px; background: linear-gradient(to right, #dc3545 0%, #dc3545 20%, #fd7e14 20%, #fd7e14 50%, #ffc107 50%, #ffc107 70%, #00EB5E 70%, #00EB5E 90%, #28a745 90%, #28a745 100%); overflow: visible;">
      <div style="position: absolute; left: ${actualValue}%; top: 50%; transform: translate(-50%, -50%); width: 3px; height: 15px; background: #221C46; z-index: 2;"></div>
      <div style="position: absolute; left: ${actualValue}%; top: -6px; transform: translateX(-50%); width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 6px solid #221C46; z-index: 3;"></div>
    </div>
    <div style="text-align: center; margin-top: 0.75rem; font-size: 0.7rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.03em;">${label.replace(/_/g, ' ')}</div>
  </div>`;

  const statsCards = [
    {
      label: 'Sentence Similarity',
      value: formatPercent(summary.similarity_ratio.sentence),
      detail: 'Matching sentences',
      progress: summary.similarity_ratio.sentence,
      clickable: hasSimilarContent,
      modalId: 'modal-similar-sentences',
    },
    {
      label: 'Word Similarity',
      value: formatPercent(summary.similarity_ratio.word),
      detail: 'Vocabulary overlap',
      progress: summary.similarity_ratio.word,
    },
    {
      label: 'N-gram Overlap',
      value: formatPercent(summary.ngram_overlap),
      detail: 'Shared phrasing',
      progress: summary.ngram_overlap,
    },
    {
      label: 'Sentences Reviewed',
      value: String(totalSentences),
      detail: `Wiki ${summary.wiki_sentence_count} | Grok ${summary.grok_sentence_count}`,
      progress:
        totalSentences > 0
          ? Math.min(
              1,
              totalSentences /
                Math.max(summary.wiki_sentence_count, summary.grok_sentence_count, 1),
            )
          : 0,
    },
    {
      label: 'Analysis Window',
      value: `${meta.analysis_window.wiki_analyzed_chars.toLocaleString()}`,
      detail: `Wiki chars (Grok: ${meta.analysis_window.grok_analyzed_chars.toLocaleString()})`,
      progress: 0.5,
    },
  ]
    .map((card) => {
      const clickableClass = card.clickable ? ' kpi-card-clickable' : '';
      const clickHandler = card.clickable ? ` onclick="openModal('${card.modalId}')"` : '';
      const arrow = card.clickable ? '<span class="kpi-arrow">›</span>' : '';

      return `<div class="kpi-card${clickableClass}"${clickHandler}>
  <p class="kpi-label">${escapeHtml(card.label)}${arrow}</p>
  <strong class="kpi-value">${card.value}</strong>
  <div class="kpi-detail">${escapeHtml(card.detail)}</div>
  <div class="progress-bar"><span style="width:${(Math.min(1, Math.max(0, card.progress ?? 0)) * 100).toFixed(1)}%;"></span></div>
</div>`;
    })
    .join('');

  const versionBox = `<div class="version-box">
    <div class="version-label">Version</div>
    <div class="version-value">${escapeHtml(meta.analyzer_version)}</div>
    <div class="version-unit">analyzer</div>
  </div>`;

  const versionWithDiff = `<div class="version-container">
    ${versionBox}
    ${renderDiffSampleButton(analysis)}
  </div>`;

  const metadataCard = `<section class="metadata-section">
  <div class="metadata-header">
    <h2>Analysis Metadata</h2>
  </div>
  <div class="metadata-grid-new">
    <div class="meta-box">
      <div class="meta-label">Wikipedia</div>
      <div class="meta-value">${meta.analysis_window.wiki_analyzed_chars.toLocaleString()}</div>
      <div class="meta-unit">chars analyzed</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Grokipedia</div>
      <div class="meta-value">${meta.analysis_window.grok_analyzed_chars.toLocaleString()}</div>
      <div class="meta-unit">chars analyzed</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Generated</div>
      <div class="meta-value">${escapeHtml(new Date(meta.generated_at).toLocaleDateString())}</div>
      <div class="meta-unit">${escapeHtml(new Date(meta.generated_at).toLocaleTimeString())}</div>
    </div>
    <div class="meta-box meta-small">
      <div class="meta-label">Cache</div>
      <div class="meta-value">${meta.cache_ttl_hours}h</div>
    </div>
    <div class="meta-box meta-small">
      <div class="meta-label">N-gram</div>
      <div class="meta-value">${meta.shingle_size}</div>
    </div>
  </div>
  <div class="metadata-info">
    <div class="info-row">
      <span class="info-label">Content Hash</span>
      <span class="info-value mono">${escapeHtml(meta.content_hash)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Source Note</span>
      <span class="info-value">${escapeHtml(meta.analysis_window.source_note)}</span>
    </div>
  </div>
</section>`;

  const footer = notesIndexUpdatedAt
    ? `<footer><p>Report generated by GWALN CLI | Notes index updated: ${escapeHtml(new Date(notesIndexUpdatedAt).toLocaleString())}</p></footer>`
    : '<footer><p>Report generated by GWALN CLI</p></footer>';

  return render('report', {
    'topic.title': escapeHtml(topic.title),
    'topic.id': escapeHtml(topic.id),
    'summary.headline_html': summary.headline.includes('<span')
      ? summary.headline
      : escapeHtml(summary.headline),
    'topic.urls.wikipedia': escapeHtml(topic.urls.wikipedia),
    'topic.urls.grokipedia': escapeHtml(topic.urls.grokipedia),
    statsCards,
    confidenceMeter,
    versionBox: versionWithDiff,
    noteInfoLogo: renderNoteInfoLogo(notePayload),
    noteInfo: renderNoteInfo(notePayload, topic.urls.wikipedia, topic.urls.grokipedia),
    missingSentences: renderList(
      `Missing Sentences (${summary.missing_sentence_count} from Wikipedia)`,
      comparison.sentences.missing,
      'modal-missing-sentences',
    ),
    extraSentences: renderList(
      `Extra Sentences (${summary.extra_sentence_count} in Grokipedia)`,
      comparison.sentences.extra,
      'modal-extra-sentences',
    ),
    alignmentTable: renderAlignmentTable(analysis),
    coreDiscrepancies: renderDiscrepancyList(
      'Core Discrepancies',
      discrepancies.primary,
      'modal-core-discrepancies',
    ),
    biasPanel: renderBiasPanel(analysis),
    hallucinationCues: renderDiscrepancyList(
      'Hallucination Flags',
      discrepancies.hallucinations,
      'modal-hallucinations',
    ),
    verifications: renderVerifications(analysis),
    metadataCard,
    footer,
    similarSentencesModal: renderSimilarSentencesModal(analysis),
  });
};
