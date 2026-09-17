/**
 * Text Classification Module
 * ──────────────────────────
 * Pure-TypeScript keyword-based classification and text processing.
 *
 * Algorithms included:
 *   1. TF-IDF vectorizer
 *   2. Multinomial Naive Bayes classifier
 *   3. BM25 ranking
 *   4. Keyword extractor (RAKE + TF-IDF based)
 *   5. Sentiment scorer (lexicon-based)
 *   6. N-gram tokenizer
 *   7. Cosine similarity
 *   8. Text preprocessing (stem, tokenize, stop-word removal)
 *   9. KNN text classifier (using TF-IDF vectors)
 *  10. Keyword-based rule classifier
 *
 * Zero dependencies.  Runs in browser or Node.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Vocabulary {
  /** term → document frequency */
  df: Map<string, number>;
  /** term → index in vector */
  index: Map<string, number>;
  /** total document count */
  nDocs: number;
}

export interface TFIDFResult {
  /** Sparse vector: termIndex → tfidf weight */
  vector: Map<number, number>;
  /** Original terms that had nonzero weight */
  terms: string[];
}

export interface ClassificationResult {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface KeywordResult {
  keyword: string;
  score: number;
  frequency: number;
}

export interface SentimentResult {
  score: number;         // -1 to +1
  label: "positive" | "negative" | "neutral";
  positiveWords: string[];
  negativeWords: string[];
}

export interface BM25Result {
  docIndex: number;
  score: number;
}

// ─── Text Preprocessing ────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need",
  "dare", "ought", "used", "this", "that", "these", "those", "i", "me",
  "my", "myself", "we", "our", "ours", "ourselves", "you", "your",
  "yours", "he", "him", "his", "she", "her", "its", "they", "them",
  "their", "what", "which", "who", "whom", "if", "then", "so", "than",
  "too", "very", "just", "about", "above", "after", "again", "also",
  "am", "any", "because", "before", "below", "between", "both",
  "each", "few", "further", "here", "how", "into", "it", "itself",
  "more", "most", "no", "nor", "not", "only", "other", "out", "over",
  "own", "same", "some", "such", "there", "through", "under", "until",
  "up", "while", "during", "once", "where", "why", "all", "every",
  "get", "got", "gets",
]);

/** Simple Porter-like suffix stemmer */
function stem(word: string): string {
  let w = word.toLowerCase();
  // Common suffixes
  const suffixes = ["ation", "ation", "iness", "ness", "ment", "able", "ible", "ful", "less", "ous", "ive", "ing", "tion", "sion", "ment", "ent", "ant", "ize", "ise", "ify", "ate", "ede", "ede", "led", "red", "ied", "ied", "ies", "es", "ed", "ly", "er", "al", "en", "s"];
  for (const suffix of suffixes) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export function stemTokens(tokens: string[]): string[] {
  return tokens.map(stem);
}

/** Remove stop words and stem a full document */
export function preprocess(text: string): string[] {
  return stemTokens(tokenize(text));
}

/** Generate n-grams from tokens */
export function ngrams(tokens: string[], n = 2): string[] {
  const result: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    result.push(tokens.slice(i, i + n).join(" "));
  }
  return result;
}

// ─── 1. TF-IDF Vectorizer ──────────────────────────────────────────────────

export function buildVocabulary(documents: string[]): Vocabulary {
  const df = new Map<string, number>();
  for (const doc of documents) {
    const uniqueTerms = new Set(preprocess(doc));
    for (const term of uniqueTerms) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const index = new Map<string, number>();
  let i = 0;
  for (const term of df.keys()) {
    index.set(term, i++);
  }
  return { df, index, nDocs: documents.length };
}

export function tfidfVectorize(
  document: string,
  vocab: Vocabulary,
): TFIDFResult {
  const tokens = preprocess(document);
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }

  const vector = new Map<number, number>();
  const terms: string[] = [];
  const maxTf = Math.max(1, ...tf.values());

  for (const [term, freq] of tf) {
    const idx = vocab.index.get(term);
    if (idx === undefined) continue;
    const tfVal = freq / maxTf; // normalized TF
    const docFreq = vocab.df.get(term) ?? 1;
    const idf = Math.log((vocab.nDocs + 1) / (docFreq + 1)) + 1;
    const weight = tfVal * idf;
    vector.set(idx, weight);
    terms.push(term);
  }

  return { vector, terms };
}

export function cosineSimilarity(a: TFIDFResult, b: TFIDFResult): number {
  let dotProd = 0;
  let normA = 0;
  let normB = 0;

  for (const [idx, w] of a.vector) {
    normA += w * w;
    const bw = b.vector.get(idx);
    if (bw !== undefined) dotProd += w * bw;
  }
  for (const [, w] of b.vector) normB += w * w;

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProd / denom;
}

// ─── 2. Multinomial Naive Bayes ────────────────────────────────────────────

export interface NaiveBayesModel {
  /** label → { term → log-probability } */
  labelLogProbs: Map<string, Map<string, number>>;
  /** label → log prior probability */
  logPriors: Map<string, number>;
  /** label → total word count */
  labelWordCounts: Map<string, number>;
  /** vocabulary size */
  vocabSize: number;
  /** all unique terms */
  terms: Set<string>;
}

export function trainNaiveBayes(
  documents: string[],
  labels: string[],
): NaiveBayesModel {
  const allTerms = new Set<string>();
  const labelCounts = new Map<string, number>();
  const labelWordCounts = new Map<string, number>();
  const labelTermCounts = new Map<string, Map<string, number>>();

  const uniqueLabels = [...new Set(labels)];
  for (const label of uniqueLabels) {
    labelCounts.set(label, 0);
    labelWordCounts.set(label, 0);
    labelTermCounts.set(label, new Map());
  }

  // Count terms per label
  documents.forEach((doc, i) => {
    const label = labels[i];
    const tokens = preprocess(doc);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    labelWordCounts.set(label, (labelWordCounts.get(label) ?? 0) + tokens.length);

    const termCounts = labelTermCounts.get(label)!;
    for (const t of tokens) {
      allTerms.add(t);
      termCounts.set(t, (termCounts.get(t) ?? 0) + 1);
    }
  });

  // Compute log-probabilities with Laplace smoothing
  const totalDocs = documents.length;
  const vocabSize = allTerms.size;
  const labelLogProbs = new Map<string, Map<string, number>>();
  const logPriors = new Map<string, number>();

  for (const label of uniqueLabels) {
    logPriors.set(label, Math.log((labelCounts.get(label) ?? 1) / totalDocs));
    const wordCounts = labelTermCounts.get(label)!;
    const totalCount = labelWordCounts.get(label) ?? 1;
    const probs = new Map<string, number>();

    for (const term of allTerms) {
      const count = wordCounts.get(term) ?? 0;
      // Laplace smoothing
      probs.set(term, Math.log((count + 1) / (totalCount + vocabSize)));
    }
    labelLogProbs.set(label, probs);
  }

  return { labelLogProbs, logPriors, labelWordCounts, vocabSize, terms: allTerms };
}

export function predictNaiveBayes(
  model: NaiveBayesModel,
  document: string,
): ClassificationResult {
  const tokens = preprocess(document);
  const scores = new Map<string, number>();

  for (const [label, logPrior] of model.logPriors) {
    let logScore = logPrior;
    const termProbs = model.labelLogProbs.get(label)!;
    for (const t of tokens) {
      logScore += termProbs.get(t) ?? Math.log(1 / ((model.labelWordCounts.get(label) ?? 1) + model.vocabSize));
    }
    scores.set(label, logScore);
  }

  // Convert to probabilities via softmax
  const maxScore = Math.max(...scores.values());
  const expScores = new Map<string, number>();
  let sumExp = 0;
  for (const [label, score] of scores) {
    const exp = Math.exp(score - maxScore);
    expScores.set(label, exp);
    sumExp += exp;
  }

  const probabilities: Record<string, number> = {};
  let bestLabel = "";
  let bestProb = -1;
  for (const [label, exp] of expScores) {
    const prob = exp / sumExp;
    probabilities[label] = prob;
    if (prob > bestProb) {
      bestProb = prob;
      bestLabel = label;
    }
  }

  return { label: bestLabel, confidence: bestProb, probabilities };
}

// ─── 3. BM25 Ranking ───────────────────────────────────────────────────────

export function bm25Score(
  query: string,
  documents: string[],
  k1 = 1.5,
  b = 0.75,
): BM25Result[] {
  const tokenizedDocs = documents.map(preprocess);
  const avgDocLen = tokenizedDocs.reduce((sum, d) => sum + d.length, 0) / documents.length;
  const N = documents.length;

  // Document frequencies
  const df = new Map<string, number>();
  for (const doc of tokenizedDocs) {
    const unique = new Set(doc);
    for (const t of unique) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }

  const queryTerms = preprocess(query);

  return documents.map((_, i) => {
    const doc = tokenizedDocs[i];
    const docLen = doc.length;

    // Term frequencies in this document
    const tf = new Map<string, number>();
    for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    for (const qt of queryTerms) {
      const termFreq = tf.get(qt) ?? 0;
      const docFreq = df.get(qt) ?? 0;
      const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
      const tfNorm = (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * (docLen / avgDocLen)));
      score += idf * tfNorm;
    }

    return { docIndex: i, score };
  });
}

// ─── 4. Keyword Extractor (RAKE-inspired) ──────────────────────────────────

export function extractKeywords(
  document: string,
  topN = 10,
): KeywordResult[] {
  const tokens = tokenize(document); // no stemming for keywords
  const wordFreq = new Map<string, number>();
  for (const t of tokens) wordFreq.set(t, (wordFreq.get(t) ?? 0) + 1);

  // Generate candidate phrases (sequences of non-stop-words)
  const phrases: string[] = [];
  let current: string[] = [];
  for (const t of tokens) {
    if (STOP_WORDS.has(t)) {
      if (current.length > 0) {
        phrases.push(current.join(" "));
        current = [];
      }
    } else {
      current.push(t);
    }
  }
  if (current.length > 0) phrases.push(current.join(" "));

  // Score phrases: sum of word frequencies
  const phraseScores = phrases.map((phrase) => {
    const words = phrase.split(" ");
    const score = words.reduce((sum, w) => sum + (wordFreq.get(w) ?? 0), 0);
    return { keyword: phrase, score, frequency: words.length };
  });

  // Sort by score descending, merge duplicates
  const merged = new Map<string, KeywordResult>();
  for (const ps of phraseScores) {
    const existing = merged.get(ps.keyword);
    if (!existing || ps.score > existing.score) {
      merged.set(ps.keyword, ps);
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ─── 5. Sentiment Scorer (Lexicon-based) ───────────────────────────────────

const POSITIVE_WORDS = new Set([
  "good", "great", "excellent", "amazing", "wonderful", "fantastic", "brilliant",
  "awesome", "outstanding", "superb", "perfect", "love", "best", "happy", "joy",
  "positive", "win", "success", "profit", "growth", "improve", "better", "strong",
  "rise", "gain", "up", "higher", "bullish", "optimistic", "beat", "surpass",
  "record", "innovation", "breakthrough", "advance", "impressive", "remarkable",
]);

const NEGATIVE_WORDS = new Set([
  "bad", "terrible", "awful", "horrible", "poor", "worst", "hate", "fail",
  "failure", "loss", "drop", "decline", "fall", "crash", "collapse", "down",
  "lower", "bearish", "pessimistic", "miss", "disappoint", "concern", "risk",
  "debt", "crisis", "recession", "inflation", "warning", "lawsuit", "fraud",
  "scandal", "hack", "breach", "recall", "shutdown", "layoff", "bankrupt",
]);

export function scoreSentiment(text: string): SentimentResult {
  const tokens = tokenize(text);
  const positiveWords: string[] = [];
  const negativeWords: string[] = [];

  for (const t of tokens) {
    if (POSITIVE_WORDS.has(t)) positiveWords.push(t);
    if (NEGATIVE_WORDS.has(t)) negativeWords.push(t);
  }

  const total = positiveWords.length + negativeWords.length;
  const score = total === 0 ? 0 : (positiveWords.length - negativeWords.length) / total;

  let label: "positive" | "negative" | "neutral" = "neutral";
  if (score > 0.1) label = "positive";
  else if (score < -0.1) label = "negative";

  return { score, label, positiveWords, negativeWords };
}

// ─── 8. KNN Text Classifier ────────────────────────────────────────────────

export function trainKNNClassifier(
  documents: string[],
  labels: string[],
  k = 3,
): { vocab: Vocabulary; documents: string[]; labels: string[]; k: number } {
  const vocab = buildVocabulary(documents);
  return { vocab, documents, labels, k };
}

export function predictKNN(
  model: { vocab: Vocabulary; documents: string[]; labels: string[]; k: number },
  document: string,
): ClassificationResult {
  const queryVec = tfidfVectorize(document, model.vocab);

  // Compute distances to all training docs
  const distances = model.documents.map((doc, i) => {
    const docVec = tfidfVectorize(doc, model.vocab);
    const sim = cosineSimilarity(queryVec, docVec);
    return { index: i, similarity: sim, label: model.labels[i] };
  });

  // Sort by similarity descending
  distances.sort((a, b) => b.similarity - a.similarity);

  // Take top-k
  const neighbors = distances.slice(0, model.k);
  const labelCounts = new Map<string, number>();
  for (const n of neighbors) {
    labelCounts.set(n.label, (labelCounts.get(n.label) ?? 0) + n.similarity);
  }

  let bestLabel = "";
  let bestScore = -1;
  const probabilities: Record<string, number> = {};
  let totalScore = 0;
  for (const [label, score] of labelCounts) {
    totalScore += score;
  }
  for (const [label, score] of labelCounts) {
    const prob = totalScore > 0 ? score / totalScore : 0;
    probabilities[label] = prob;
    if (prob > bestScore) {
      bestScore = prob;
      bestLabel = label;
    }
  }

  return { label: bestLabel, confidence: bestScore, probabilities };
}

// ─── 10. Keyword-Rule Classifier ──────────────────────────────────────────

export interface ClassificationRule {
  label: string;
  keywords: string[];
  weight?: number;
  matchThreshold?: number; // fraction of keywords that must match (default 0.5)
}

export function classifyByRules(
  text: string,
  rules: ClassificationRule[],
): ClassificationResult {
  const tokens = new Set(preprocess(text));
  const scores: Record<string, number> = {};

  let bestLabel = "unknown";
  let bestScore = 0;

  for (const rule of rules) {
    const keywords = rule.keywords.map((k) => stem(k));
    const matches = keywords.filter((k) => tokens.has(k)).length;
    const threshold = rule.matchThreshold ?? 0.5;
    const weight = rule.weight ?? 1;
    const score = (matches / Math.max(1, keywords.length)) * weight;
    scores[rule.label] = score;

    if (score > bestScore) {
      bestScore = score;
      bestLabel = rule.label;
    }
  }

  // Normalize to probabilities
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const probabilities: Record<string, number> = {};
  for (const [label, score] of Object.entries(scores)) {
    probabilities[label] = score / totalScore;
  }

  return {
    label: bestLabel,
    confidence: bestScore,
    probabilities,
  };
}
