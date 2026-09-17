/**
 * stitaP ML Tool Registry
 *
 * Exposes the pure TypeScript ML engine as agent-callable tools.
 * Train, predict, cluster, forecast, detect faults, classify text,
 * solve equations — zero dependencies, runs in-browser.
 */

import type { ToolManifest } from "../tool-types";

export const ML_TOOLS: ToolManifest[] = [
  // ─── Supervised Learning ──────────────────────────────────────────────────
  {
    id: "ml.train",
    name: "Train Model",
    description:
      "Train a machine learning model on labeled data. Supports linear/logistic regression, KNN, random forest, gradient boosting. Returns trained model + metrics.",
    category: "analytics",
    icon: "Brain",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["ml", "train", "supervised", "regression", "classification"],
    color: "#8B5CF6",
    parameters: [
      {
        name: "algorithm",
        type: "enum",
        description: "ML algorithm to use",
        required: true,
        enum: ["linear_regression", "logistic_regression", "knn", "random_forest", "gradient_boosting"],
      },
      {
        name: "data",
        type: "string",
        description:
          'JSON array of objects. Each object has feature columns + a "target" column.',
        required: true,
      },
      {
        name: "testSplit",
        type: "number",
        description: "Fraction of data to hold out for testing (0-1)",
        required: false,
        default: 0.2,
        min: 0.05,
        max: 0.5,
      },
      {
        name: "hyperparams",
        type: "string",
        description:
          'JSON object of algorithm-specific hyperparameters. E.g. {"k": 5} for KNN, {"numTrees": 100} for random forest',
        required: false,
      },
    ],
    capabilities: [
      {
        name: "ml-train",
        description: "Train sklearn-compatible models in pure TypeScript",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "ml.predict",
    name: "Predict",
    description:
      "Run predictions using a previously trained model on new data points.",
    category: "analytics",
    icon: "Brain",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["ml", "predict", "inference"],
    color: "#8B5CF6",
    parameters: [
      {
        name: "modelJson",
        type: "string",
        description: "Serialized model JSON from ml.train",
        required: true,
      },
      {
        name: "data",
        type: "string",
        description:
          'JSON array of objects with the same feature columns as training data (no "target" column needed).',
        required: true,
      },
    ],
    capabilities: [
      {
        name: "ml-predict",
        description: "Run inference with trained ML models",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "ml.evaluate",
    name: "Evaluate Model",
    description:
      "Evaluate a trained model against test data. Returns MSE, RMSE, MAE, R-squared, accuracy, precision, recall, F1, confusion matrix.",
    category: "analytics",
    icon: "BarChart3",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["ml", "evaluate", "metrics", "accuracy"],
    color: "#8B5CF6",
    parameters: [
      {
        name: "modelJson",
        type: "string",
        description: "Serialized model JSON from ml.train",
        required: true,
      },
      {
        name: "data",
        type: "string",
        description: 'JSON array of objects with feature columns + "target" column',
        required: true,
      },
    ],
    capabilities: [
      {
        name: "ml-evaluate",
        description: "Compute classification and regression metrics",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  // ─── Unsupervised Learning ────────────────────────────────────────────────
  {
    id: "ml.cluster",
    name: "K-Means Clustering",
    description:
      "Group unlabeled data into K clusters. Returns cluster assignments, centroids, inertia, and silhouette scores.",
    category: "analytics",
    icon: "Target",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["ml", "clustering", "kmeans", "unsupervised"],
    color: "#8B5CF6",
    parameters: [
      {
        name: "data",
        type: "string",
        description: "JSON array of objects with numeric feature columns",
        required: true,
      },
      {
        name: "k",
        type: "number",
        description: "Number of clusters",
        required: true,
        min: 2,
        max: 50,
      },
      {
        name: "maxIter",
        type: "number",
        description: "Maximum iterations",
        required: false,
        default: 100,
      },
    ],
    capabilities: [
      {
        name: "ml-cluster",
        description: "Unsupervised clustering with K-Means",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "ml.pca",
    name: "PCA (Dimensionality Reduction)",
    description:
      "Reduce feature dimensions via Principal Component Analysis. Returns transformed data, explained variance ratios, and loadings.",
    category: "analytics",
    icon: "Maximize2",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["ml", "pca", "dimensionality", "reduction"],
    color: "#8B5CF6",
    parameters: [
      {
        name: "data",
        type: "string",
        description: "JSON array of objects with numeric feature columns",
        required: true,
      },
      {
        name: "nComponents",
        type: "number",
        description: "Number of principal components to keep",
        required: false,
        default: 2,
        min: 1,
        max: 50,
      },
    ],
    capabilities: [
      {
        name: "ml-pca",
        description: "Principal Component Analysis for dimensionality reduction",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  // ─── Time Series ──────────────────────────────────────────────────────────
  {
    id: "ml.forecast",
    name: "Time Series Forecast",
    description:
      "Forecast future values from a time series using Holt-Winters exponential smoothing or moving average. Returns predictions with confidence intervals.",
    category: "analytics",
    icon: "TrendingUp",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["ml", "forecast", "time-series", "smoothing"],
    color: "#8B5CF6",
    parameters: [
      {
        name: "series",
        type: "string",
        description: "JSON array of numeric values (the time series)",
        required: true,
      },
      {
        name: "horizon",
        type: "number",
        description: "How many steps ahead to forecast",
        required: true,
        min: 1,
        max: 365,
      },
      {
        name: "method",
        type: "enum",
        description: "Forecasting method",
        required: false,
        default: "holt_winters",
        enum: ["holt_winters", "moving_average"],
      },
      {
        name: "seasonLength",
        type: "number",
        description: "Seasonal period length (for Holt-Winters)",
        required: false,
        default: 12,
      },
    ],
    capabilities: [
      {
        name: "ml-forecast",
        description: "Time series forecasting with exponential smoothing",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  // ─── Feature Analysis ─────────────────────────────────────────────────────
  {
    id: "ml.feature_importance",
    name: "Feature Importance",
    description:
      "Get feature importance scores from tree-based models (random forest, gradient boosting).",
    category: "analytics",
    icon: "ListOrdered",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["ml", "feature", "importance", "explainability"],
    color: "#8B5CF6",
    parameters: [
      {
        name: "modelJson",
        type: "string",
        description:
          "Serialized model JSON (must be random_forest or gradient_boosting)",
        required: true,
      },
      {
        name: "featureNames",
        type: "string",
        description: "JSON array of feature names for labeling",
        required: false,
      },
    ],
    capabilities: [
      {
        name: "ml-explain",
        description: "Extract feature importance from tree-based models",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  // ─── Preprocessing ────────────────────────────────────────────────────────
  {
    id: "ml.preprocess",
    name: "Preprocess Data",
    description:
      "Clean and prepare data for ML: normalize, standardize, handle missing values, encode categoricals, split train/test.",
    category: "analytics",
    icon: "Wrench",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["ml", "preprocess", "clean", "normalize"],
    color: "#8B5CF6",
    parameters: [
      {
        name: "data",
        type: "string",
        description: "JSON array of objects",
        required: true,
      },
      {
        name: "operations",
        type: "string",
        description:
          'JSON array of operations: ["normalize", "standardize", "drop_missing", "encode_categoricals"]',
        required: true,
      },
      {
        name: "targetColumn",
        type: "string",
        description: "Name of the target/label column",
        required: false,
      },
    ],
    capabilities: [
      {
        name: "ml-preprocess",
        description: "Data preprocessing for machine learning pipelines",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FAULT DETECTION TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fault.detect_anomalies",
    name: "Anomaly / Fault Detection",
    description:
      "Detect anomalies and faults in time-series or multivariate data using Z-score, Mahalanobis distance, Isolation Forest, or change-point detection. Returns per-point anomaly scores and flags.",
    category: "analytics",
    icon: "AlertTriangle",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["fault", "anomaly", "detection", "outlier", "isolation-forest", "z-score"],
    color: "#EF4444",
    parameters: [
      {
        name: "data",
        type: "string",
        description:
          'JSON array of numbers (univariate) or JSON array of arrays (multivariate rows)',
        required: true,
      },
      {
        name: "method",
        type: "enum",
        description: "Detection algorithm",
        required: false,
        default: "z-score",
        enum: ["z-score", "mad", "mahalanobis", "isolation_forest", "change_point"],
      },
      {
        name: "threshold",
        type: "number",
        description:
          "Anomaly threshold. Z-score: std deviations (default 3.0). Isolation Forest: contamination rate 0-1 (default 0.1).",
        required: false,
      },
      {
        name: "windowSize",
        type: "number",
        description: "Sliding window size for change-point detection (default 20)",
        required: false,
      },
    ],
    capabilities: [
      {
        name: "fault-detect",
        description: "Multi-algorithm anomaly and fault detection",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "fault.spc_chart",
    name: "Statistical Process Control (SPC)",
    description:
      "Generate SPC control charts (X̄ chart, EWMA, CUSUM) for process monitoring. Detects out-of-control signals, trends, and shifts.",
    category: "analytics",
    icon: "Activity",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["fault", "spc", "control-chart", "ewma", "cusum", "quality"],
    color: "#EF4444",
    parameters: [
      {
        name: "data",
        type: "string",
        description: "JSON array of numeric measurements",
        required: true,
      },
      {
        name: "method",
        type: "enum",
        description: "Control chart method",
        required: false,
        default: "xbar",
        enum: ["xbar", "ewma", "cusum"],
      },
      {
        name: "lambda",
        type: "number",
        description: "EWMA smoothing factor (0-1, default 0.2)",
        required: false,
      },
      {
        name: "threshold",
        type: "number",
        description: "CUSUM decision interval (default 5.0)",
        required: false,
      },
    ],
    capabilities: [
      {
        name: "fault-spc",
        description: "Statistical Process Control chart generation and analysis",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "fault.classify",
    name: "Rule-Based Fault Classifier",
    description:
      "Classify fault events using configurable diagnostic rules. Supports custom rules with condition matching, severity assignment, and recommendations.",
    category: "analytics",
    icon: "Tags",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["fault", "classify", "rules", "diagnostic", "severity"],
    color: "#EF4444",
    parameters: [
      {
        name: "events",
        type: "string",
        description:
          'JSON array of fault events: [{ "timestamp": 123, "faultType": "temperature", "source": "sensor-A", "details": { "value": 92 } }]',
        required: true,
      },
      {
        name: "rules",
        type: "string",
        description:
          'Optional JSON array of custom rules. Each: { "name": "rule1", "keywords": ["temp", "hot"], "severity": "high" }',
        required: false,
      },
    ],
    capabilities: [
      {
        name: "fault-classify",
        description: "Rule-based fault classification with diagnostics",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEXT CLASSIFICATION TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "text.train_classifier",
    name: "Train Text Classifier",
    description:
      "Train a keyword-based text classifier using Naive Bayes, KNN, or rule-based methods on labeled documents. Returns trained model for prediction.",
    category: "analytics",
    icon: "FileSearch",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["text", "classify", "naive-bayes", "keyword", "tfidf", "train"],
    color: "#F59E0B",
    parameters: [
      {
        name: "documents",
        type: "string",
        description: 'JSON array of text strings (the training documents)',
        required: true,
      },
      {
        name: "labels",
        type: "string",
        description:
          'JSON array of label strings (same length as documents, one label per document)',
        required: true,
      },
      {
        name: "method",
        type: "enum",
        description: "Classification algorithm",
        required: false,
        default: "naive_bayes",
        enum: ["naive_bayes", "knn", "keyword_rules"],
      },
      {
        name: "k",
        type: "number",
        description: "Number of neighbors for KNN (default 3)",
        required: false,
      },
    ],
    capabilities: [
      {
        name: "text-train",
        description: "Train text classifiers with TF-IDF and Naive Bayes",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "text.classify",
    name: "Classify Text",
    description:
      "Classify a text document using a previously trained model. Returns predicted label, confidence score, and class probabilities.",
    category: "analytics",
    icon: "FileSearch",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["text", "classify", "predict", "label"],
    color: "#F59E0B",
    parameters: [
      {
        name: "modelJson",
        type: "string",
        description: "Serialized model JSON from text.train_classifier",
        required: true,
      },
      {
        name: "text",
        type: "string",
        description: "The text to classify",
        required: true,
      },
    ],
    capabilities: [
      {
        name: "text-classify",
        description: "Classify text documents with trained models",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "text.extract_keywords",
    name: "Extract Keywords",
    description:
      "Extract top keywords and keyphrases from a document using RAKE-inspired scoring. Returns ranked keywords with scores and frequency.",
    category: "analytics",
    icon: "Key",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["text", "keyword", "extract", "rake", "phrase"],
    color: "#F59E0B",
    parameters: [
      {
        name: "text",
        type: "string",
        description: "The document to extract keywords from",
        required: true,
      },
      {
        name: "topN",
        type: "number",
        description: "Number of top keywords to return (default 10)",
        required: false,
      },
    ],
    capabilities: [
      {
        name: "text-keywords",
        description: "RAKE-based keyword extraction",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "text.sentiment",
    name: "Sentiment Analysis",
    description:
      "Lexicon-based sentiment scoring. Returns score (-1 to +1), label (positive/negative/neutral), and matched sentiment words.",
    category: "analytics",
    icon: "Smile",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["text", "sentiment", "nlp", "positive", "negative"],
    color: "#F59E0B",
    parameters: [
      {
        name: "text",
        type: "string",
        description: "The text to analyze",
        required: true,
      },
    ],
    capabilities: [
      {
        name: "text-sentiment",
        description: "Lexicon-based sentiment analysis",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "text.bm25_rank",
    name: "BM25 Document Ranking",
    description:
      "Rank documents by relevance to a query using BM25 (Okapi). Returns documents sorted by relevance score.",
    category: "analytics",
    icon: "Search",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["text", "bm25", "rank", "search", "retrieval"],
    color: "#F59E0B",
    parameters: [
      {
        name: "query",
        type: "string",
        description: "The search query",
        required: true,
      },
      {
        name: "documents",
        type: "string",
        description: 'JSON array of document strings',
        required: true,
      },
      {
        name: "topN",
        type: "number",
        description: "Number of top results to return",
        required: false,
        default: 5,
      },
    ],
    capabilities: [
      {
        name: "text-bm25",
        description: "BM25 document ranking and retrieval",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NUMERICAL MATHEMATICS TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "math.poly_fit",
    name: "Polynomial Regression",
    description:
      "Fit a polynomial of given degree to (x, y) data using least-squares. Returns coefficients, degree, and R² goodness-of-fit.",
    category: "analytics",
    icon: "FunctionSquare",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["math", "polynomial", "regression", "fit", "least-squares", "curve"],
    color: "#06B6D4",
    parameters: [
      {
        name: "x",
        type: "string",
        description: "JSON array of x-values",
        required: true,
      },
      {
        name: "y",
        type: "string",
        description: "JSON array of y-values (same length as x)",
        required: true,
      },
      {
        name: "degree",
        type: "number",
        description: "Polynomial degree (1=linear, 2=quadratic, 3=cubic, ...)",
        required: true,
        min: 1,
        max: 20,
      },
    ],
    capabilities: [
      {
        name: "math-poly",
        description: "Polynomial curve fitting with least-squares",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "math.derivative",
    name: "Symbolic Differentiation",
    description:
      "Compute the derivative of a polynomial or numeric function. Returns derivative coefficients or gradient vector.",
    category: "analytics",
    icon: "TrendingDown",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["math", "derivative", "differentiation", "gradient", "calculus"],
    color: "#06B6D4",
    parameters: [
      {
        name: "coefficients",
        type: "string",
        description:
          'JSON array of polynomial coefficients [a0, a1, a2, ...] for p(x) = a0 + a1*x + a2*x^2 + ...',
        required: false,
      },
      {
        name: "functionType",
        type: "enum",
        description: "Type of derivative to compute",
        required: false,
        default: "polynomial",
        enum: ["polynomial", "second_polynomial", "numerical_gradient"],
      },
      {
        name: "x",
        type: "string",
        description: 'For numerical_gradient: JSON array of x values at which to evaluate gradient',
        required: false,
      },
    ],
    capabilities: [
      {
        name: "math-derivative",
        description: "Symbolic and numerical differentiation",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "math.integrate",
    name: "Numerical Integration",
    description:
      "Compute definite integrals using Simpson's 1/3 rule or trapezoidal method. Supports arbitrary functions defined as coefficient polynomials.",
    category: "analytics",
    icon: "AreaChart",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["math", "integration", "integral", "simpson", "trapezoidal", "calculus"],
    color: "#06B6D4",
    parameters: [
      {
        name: "coefficients",
        type: "string",
        description: 'JSON array of polynomial coefficients [a0, a1, a2, ...]',
        required: true,
      },
      {
        name: "a",
        type: "number",
        description: "Lower bound of integration",
        required: true,
      },
      {
        name: "b",
        type: "number",
        description: "Upper bound of integration",
        required: true,
      },
      {
        name: "method",
        type: "enum",
        description: "Integration method",
        required: false,
        default: "simpson",
        enum: ["simpson", "trapezoidal"],
      },
      {
        name: "steps",
        type: "number",
        description: "Number of integration steps (default 1000)",
        required: false,
      },
    ],
    capabilities: [
      {
        name: "math-integrate",
        description: "Numerical integration with Simpson and trapezoidal rules",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "math.solve_ode",
    name: "ODE Solver",
    description:
      "Solve ordinary differential equations using Euler or 4th-order Runge-Kutta methods. Supports scalar and system ODEs.",
    category: "analytics",
    icon: "GitBranch",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["math", "ode", "differential", "runge-kutta", "euler", "equation"],
    color: "#06B6D4",
    parameters: [
      {
        name: "type",
        type: "enum",
        description: "ODE type",
        required: false,
        default: "scalar",
        enum: ["scalar", "system"],
      },
      {
        name: "y0",
        type: "string",
        description: "Initial condition: number for scalar, JSON array for system",
        required: true,
      },
      {
        name: "t0",
        type: "number",
        description: "Start time",
        required: true,
      },
      {
        name: "tEnd",
        type: "number",
        description: "End time",
        required: true,
      },
      {
        name: "dt",
        type: "number",
        description: "Time step (default 0.01)",
        required: false,
      },
      {
        name: "method",
        type: "enum",
        description: "Numerical method",
        required: false,
        default: "rk4",
        enum: ["euler", "rk4"],
      },
    ],
    capabilities: [
      {
        name: "math-ode",
        description: "Ordinary differential equation solvers",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "math.solve_pde",
    name: "PDE Solver",
    description:
      "Solve partial differential equations using finite-difference methods. Supports 1D heat equation, 1D wave equation, and 2D Laplace equation.",
    category: "analytics",
    icon: "Grid3X3",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["math", "pde", "partial-differential", "heat", "wave", "laplace", "finite-difference"],
    color: "#06B6D4",
    parameters: [
      {
        name: "equation",
        type: "enum",
        description: "PDE equation type",
        required: true,
        enum: ["heat", "wave", "laplace"],
      },
      {
        name: "alpha",
        type: "number",
        description: "Thermal diffusivity (heat equation) or wave speed (wave equation)",
        required: false,
      },
      {
        name: "L",
        type: "number",
        description: "Domain length [0, L]",
        required: true,
      },
      {
        name: "T",
        type: "number",
        description: "Final simulation time",
        required: true,
      },
      {
        name: "nx",
        type: "number",
        description: "Number of spatial grid points",
        required: false,
        default: 50,
      },
      {
        name: "nt",
        type: "number",
        description: "Number of time steps",
        required: false,
        default: 100,
      },
    ],
    capabilities: [
      {
        name: "math-pde",
        description: "Partial differential equation solvers with finite-difference",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },

  {
    id: "math.find_root",
    name: "Root Finding",
    description:
      "Find roots of equations using Bisection, Newton-Raphson, or Secant methods. Returns root value, convergence status, and iteration count.",
    category: "analytics",
    icon: "Crosshair",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["math", "root", "bisection", "newton", "secant", "equation", "solver"],
    color: "#06B6D4",
    parameters: [
      {
        name: "method",
        type: "enum",
        description: "Root-finding method",
        required: false,
        default: "bisection",
        enum: ["bisection", "newton_raphson", "secant"],
      },
      {
        name: "a",
        type: "number",
        description: "Lower bound (bisection) or first guess (secant)",
        required: true,
      },
      {
        name: "b",
        type: "number",
        description: "Upper bound (bisection) or second guess (secant)",
        required: true,
      },
      {
        name: "tolerance",
        type: "number",
        description: "Convergence tolerance (default 1e-8)",
        required: false,
      },
    ],
    capabilities: [
      {
        name: "math-root",
        description: "Numerical root finding with multiple algorithms",
        requiresBrowser: false,
        requiresNetwork: false,
        offline: true,
      },
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: "2025-01-15",
    slmFriendly: false,
  },
];
