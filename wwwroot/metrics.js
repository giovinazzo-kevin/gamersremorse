/**
 * Metrics module for gamersremorse
 * Pure analysis functions - no UI, no side effects
 * 
 * Two types of metrics:
 * 1. RATIO-BASED: Comparing two groups (positive vs negative). Thresholds are intuitive percentages.
 * 2. STDDEV-BASED: Detecting unusual patterns within a distribution. Thresholds are statistical.
 */

const Metrics = {
    hierarchies: {
        // Key beats Values
        'PREDATORY': ['EXTRACTIVE'],
        'EXTRACTIVE': ['TROUBLED'],
        'FLOP': ['TROUBLED'],
        'TROUBLED': ['HONEST'],
        'ENSHITTIFIED': ['REVISIONIST', 'HONEYMOON'],
    },
    tagDefinitions: [
        // ============================================================
        // RATIO-BASED TAGS
        // Comparing positive vs negative groups
        // Thresholds are intuitive: 1.3x = "30% more", 0.7x = "30% less"
        // ============================================================
        {
            id: 'HEALTHY',
            condition: (m) => m.positiveRatio > 0.80 && m.medianRatio < 1.3,
            reason: (m) => `${Math.round(m.positiveRatio * 100)}% positive reviews`,
            severity: -0.2,
            color: 'var(--color-tag-healthy)'
        },
        {
            id: 'HONEST',
            condition: (m) => m.medianRatio < 0.7 && m.negativeRatio > 0.05,
            reason: (m) => `Negatives out at ${Math.round(m.negMedianReview / 60)}h vs positives at ${Math.round(m.posMedianReview / 60)}h (${Math.round((1 - m.medianRatio) * 100)}% earlier)`,
            severity: -0.15,
            color: 'var(--color-tag-honest)'
        },
        {
            id: 'EXTRACTIVE',
            condition: (m) => m.medianRatio > 1.3
                && m.negativeRatio > 0.20
                && m.temporalDriftZ <= 1,
            reason: (m) => `${Math.round(m.negativeRatio * 100)}% negative at ${Math.round(m.negMedianReview / 60)}h (${Math.round((m.medianRatio - 1) * 100)}% longer than positives)`,
            severity: (m) => Math.min(0.3, (m.medianRatio - 1) * 0.3),
            color: 'var(--color-tag-extractive)'
        },
        {
            id: 'ENSHITTIFIED',
            condition: (m) => {
                // Strong version: extraction pattern + declining sentiment OR mass negative revisions
                const hasExtraction = m.medianRatio > 1.3 && m.negativeRatio > 0.20;
                const hasDecline = m.temporalDriftZ > 1;
                const hasMassRevisions = m.recentNegativeEditRatio >= 0.6 && m.oldReviewsEditedRatio >= 0.3;
                return hasExtraction && (hasDecline || hasMassRevisions);
            },
            reason: (m) => {
                if (m.recentNegativeEditRatio >= 0.6 && m.oldReviewsEditedRatio >= 0.3) {
                    return `Veterans flipping negative: ${Math.round(m.recentNegativeEditRatio * 100)}% of recent edits are thumbs down`;
                }
                return `Was good, got ruined: sentiment ${Math.round(m.firstHalfNegRatio * 100)}% → ${Math.round(m.secondHalfNegRatio * 100)}% negative`;
            },
            severity: (m) => Math.min(0.35, (m.medianRatio - 1) * 0.3 + m.temporalDriftZ * 0.05),
            color: 'var(--color-tag-enshittified)'
        },
        {
            id: 'PREDATORY',
            condition: (m) => m.medianRatio > 1.5 && m.negativeRatio > 0.30,
            reason: (m) => `${Math.round(m.negativeRatio * 100)}% negative after ${Math.round(m.negMedianReview / 60)}h median (${Math.round((m.medianRatio - 1) * 100)}% longer than positive)`,
            severity: 0.25,
            color: 'var(--color-tag-predatory)'
        },
        {
            id: 'STOCKHOLM',
            condition: (m) => {
                const certainNegRatio = m.counts.negative / Math.max(1, m.counts.negative + m.counts.uncertainNegative);
                return m.stockholmIndex > 1.5
                    && m.negMedianReview > 200 * 60
                    && certainNegRatio > 0.5;
            },
            reason: (m) => `Haters: ${Math.round(m.negMedianReview / 60)}h at review → ${Math.round(m.negMedianTotal / 60)}h total (${Math.round((m.stockholmIndex - 1) * 100)}% more after hating it)`,
            severity: (m) => Math.min(0.25, (m.stockholmIndex - 1) * 0.2),
            color: 'var(--color-tag-stockholm)'
        },
        {
            id: 'DIVISIVE',
            condition: (m) => m.negativeRatio > 0.35 && m.negativeRatio < 0.50 && m.posMedianReview > 20 * 60,
            reason: (m) => `${Math.round(m.positiveRatio * 100)}/${Math.round(m.negativeRatio * 100)} split`,
            severity: 0.05,
            color: 'var(--color-tag-divisive)'
        },
        {
            id: 'FLOP',
            condition: (m) => m.negativeRatio > 0.50 && m.medianRatio < 0.7,
            reason: (m) => `${Math.round(m.negativeRatio * 100)}% negative at only ${Math.round(m.negMedianReview / 60)}h median`,
            severity: 0.2,
            color: 'var(--color-tag-flop)'
        },
        {
            id: 'TROUBLED',
            condition: (m) => m.negativeRatio > 0.35 && m.medianRatio <= 1.0 && m.positiveRatio < 0.80,
            reason: (m) => `${Math.round(m.negativeRatio * 100)}% negative at ${Math.round(m.negMedianReview / 60)}h`,
            severity: 0.1,
            color: 'var(--color-tag-troubled)'
        },
        {
            id: 'REFUND_TRAP',
            condition: (m) => m.refundPosRate !== null && m.refundPosRate >= 0.20 && m.refundNegRate < 0.10 && m.negativeRatio > 0.15,
            reason: (m) => `${Math.round(m.refundPosRate * 100)}% of positives before 2h, but only ${Math.round(m.refundNegRate * 100)}% of negatives`,
            severity: 0.15,
            color: 'var(--color-tag-refund-trap)'
        },
        // ============================================================
        // STDDEV-BASED TAGS  
        // Detecting unusual patterns within a distribution
        // Thresholds: 1σ = unusual (outside 68%), 2σ = very unusual (outside 95%)
        // ============================================================

        {
            id: 'DEAD',
            condition: (m) => m.isEndDead,
            reason: (m) => `Activity declined - tail end is dead`,
            severity: 0.15,
            color: 'var(--color-tag-dead)'
        },
        {
            id: 'CULT',
            condition: (m) => m.tailRatio > 0.05 && (m.isEndDead || m.total < 2000),
            reason: (m) => `${Math.round(m.tailRatio * 100)}% at extreme playtimes (expected ~2.5%)`,
            severity: 0,
            color: 'var(--color-tag-cult)'
        },
        {
            id: 'HONEYMOON',
            condition: (m) => m.temporalDriftZ > 1 && m.medianRatio <= 1.3,
            reason: (m) => `Sentiment declined: ${Math.round(m.firstHalfNegRatio * 100)}% → ${Math.round(m.secondHalfNegRatio * 100)}% negative`,
            severity: 0.1,
            color: 'var(--color-tag-honeymoon)'
        },
        {
            id: 'REDEMPTION',
            condition: (m) => m.temporalDriftZ < -1 && !m.hasRevival,
            reason: (m) => `Sentiment improved: ${Math.round(m.firstHalfNegRatio * 100)}% → ${Math.round(m.secondHalfNegRatio * 100)}% negative`,
            severity: -0.1,
            color: 'var(--color-tag-redemption)'
        },
        
        // ============================================================
        // REVIVAL TAGS (requires death gap + comeback)
        // 2x2x2 matrix: startedGood × endedGood × stillAlive
        // ============================================================

        {
            id: 'PHOENIX',
            condition: (m) => m.hasRevival && m.firstWaveNegRatio < 0.5 && m.lastWaveNegRatio < 0.5 && m.isStillAlive,
            reason: (m) => `Rose from ashes: ${Math.round((1 - m.firstWaveNegRatio) * 100)}% → ${Math.round((1 - m.lastWaveNegRatio) * 100)}% positive, still flying`,
            severity: -0.1,
            color: 'var(--color-tag-phoenix)'
        },
        {
            id: 'PRESS_F',
            condition: (m) => m.hasRevival && m.firstWaveNegRatio < 0.5 && m.lastWaveNegRatio < 0.5 && !m.isStillAlive,
            reason: (m) => `Had a good run: ${Math.round((1 - m.firstWaveNegRatio) * 100)}% → ${Math.round((1 - m.lastWaveNegRatio) * 100)}% positive, died with honor`,
            severity: 0,
            color: 'var(--color-tag-press-f)'
        },
        {
            id: 'ZOMBIE',
            condition: (m) => m.hasRevival && m.firstWaveNegRatio < 0.5 && m.lastWaveNegRatio >= 0.5 && m.isStillAlive,
            reason: (m) => `Came back wrong: ${Math.round((1 - m.firstWaveNegRatio) * 100)}% → ${Math.round((1 - m.lastWaveNegRatio) * 100)}% positive, still shambling`,
            severity: 0.2,
            color: 'var(--color-tag-zombie)'
        },
        {
            id: 'RUGPULL',
            condition: (m) => m.hasRevival && m.firstWaveNegRatio < 0.5 && m.lastWaveNegRatio >= 0.5 && !m.isStillAlive,
            reason: (m) => `Came back wrong: ${Math.round((1 - m.firstWaveNegRatio) * 100)}% → ${Math.round((1 - m.lastWaveNegRatio) * 100)}% positive, died again`,
            severity: 0.2,
            color: 'var(--color-tag-rugpull)'
        },
        {
            id: '180',
            condition: (m) => m.hasRevival && m.firstWaveNegRatio >= 0.5 && m.lastWaveNegRatio < 0.5 && m.isStillAlive,
            reason: (m) => `Started bad (${Math.round(m.firstWaveNegRatio * 100)}% negative), now good (${Math.round(m.lastWaveNegRatio * 100)}% negative)`,
            severity: -0.15,
            color: 'var(--color-tag-180)'
        },
        {
            id: 'HOPELESS',
            condition: (m) => m.hasRevival && m.firstWaveNegRatio >= 0.5 && m.lastWaveNegRatio < 0.5 && !m.isStillAlive,
            reason: (m) => `Fixed it too late: ${Math.round(m.firstWaveNegRatio * 100)}% → ${Math.round(m.lastWaveNegRatio * 100)}% negative, nobody came back`,
            severity: 0.05,
            color: 'var(--color-tag-hopeless)'
        },
        {
            id: 'PLAGUE',
            condition: (m) => m.hasRevival && m.firstWaveNegRatio >= 0.5 && m.lastWaveNegRatio >= 0.5 && m.isStillAlive,
            reason: (m) => `Won't die, won't improve: ${Math.round(m.firstWaveNegRatio * 100)}% → ${Math.round(m.lastWaveNegRatio * 100)}% negative`,
            severity: 0.15,
            color: 'var(--color-tag-plague)'
        },
        {
            id: 'CURSED',
            condition: (m) => m.hasRevival && m.firstWaveNegRatio >= 0.5 && m.lastWaveNegRatio >= 0.5 && !m.isStillAlive,
            reason: (m) => `Born bad, died bad, twice: ${Math.round(m.firstWaveNegRatio * 100)}% → ${Math.round(m.lastWaveNegRatio * 100)}% negative`,
            severity: 0.1,
            color: 'var(--color-tag-cursed)'
        },
        {
            id: 'ADDICTIVE',
            condition: (m) => m.p95Playtime > m.posMedianReview * 5 && m.p95Playtime > 500 * 60 && m.positiveRatio > 0.5,
            reason: (m) => `Top players at ${Math.round(m.p95Playtime / 60)}h vs ${Math.round(m.posMedianReview / 60)}h median (${Math.round(m.p95Playtime / m.posMedianReview)}x)`,
            severity: 0,
            color: 'var(--color-tag-addictive)'
        },

        // ============================================================
        // DATA QUALITY TAGS
        // ============================================================
        {
            id: 'HORNY',
            condition: (m) => m.isSexual,
            reason: (m) => `Contains sexual content`,
            severity: 0,
            color: 'var(--color-tag-horny)'
        },
        {
            id: 'LOW_DATA',
            condition: (m) => m.confidence < 0.3,
            reason: (m) => `Only ${m.total} reviews - interpret with caution`,
            severity: 0,
            color: 'var(--color-tag-low-data)'
        },
        {
            id: 'CORRUPTED',
            condition: (m) => m.anomalyDensity > 0.2,
            reason: (m) => `${Math.round(m.anomalyDensity * 100)}% anomalous data points`,
            severity: 0,
            color: 'var(--color-tag-corrupted)'
        },
        {
            id: 'REVIEW_BOMBED',
            condition: (m) => m.negativeSpikes?.length > 0 && m.negativeSpikes.some(s => s.z >= 3 && s.count >= 50),
            reason: (m) => {
                const significant = m.negativeSpikes.filter(s => s.z >= 3 && s.count >= 50);
                const totalCount = significant.reduce((sum, s) => sum + s.count, 0);
                const months = significant.map(s => s.month).join(', ');
                return `${significant.length} negative surge${significant.length > 1 ? 's' : ''} (${months}): ${totalCount} reviews excluded`;
            },
            severity: 0,
            color: 'var(--color-tag-review-bombed)'
        },
        {
            id: 'SURGE',
            condition: (m) => m.positiveSpikes?.length > 0 && m.positiveSpikes.some(s => s.z >= 4 && s.count >= 100 && s.multiple >= 3),
            reason: (m) => {
                const significant = m.positiveSpikes.filter(s => s.z >= 4 && s.count >= 100 && s.multiple >= 3);
                const months = significant.map(s => s.month).join(', ');
                return `Viral moment in ${months} (excluded from stats)`;
            },
            severity: 0,
            color: 'var(--color-tag-surge)'
        },
        // ============================================================
        // EDIT PATTERN TAGS
        // Detecting sentiment shifts via review edits
        // ============================================================
        {
            id: 'REVISIONIST',
            condition: (m) => m.recentNegativeEditRatio >= 0.5 && m.oldReviewsEditedRatio >= 0.15 && m.totalEdits >= 20,
            reason: (m) => `${Math.round(m.recentNegativeEditRatio * 100)}% of recent edits negative, ${Math.round(m.oldReviewsEditedRatio * 100)}% of old reviews revised`,
            severity: 0.1,
            color: 'var(--color-tag-revisionist)'
        }
    ],

    /**
     * Compute all metrics from a snapshot
     */
    compute(snapshot, options = {}) {
        const buckets = snapshot.bucketsByReviewTime;
        const totalBuckets = snapshot.bucketsByTotalTime;
        const filter = options.timelineFilter || null;
        const isFree = options.isFree || false;
        const isSexual = options.isSexual || false;

        // Compute sampling weights to correct for oversampling bias
        const gameTotal = snapshot.gameTotalPositive + snapshot.gameTotalNegative;
        const sampledTotal = snapshot.totalPositive + snapshot.totalNegative;
        const actualNegRatio = gameTotal > 0 ? snapshot.gameTotalNegative / gameTotal : 0.5;
        const sampledNegRatio = sampledTotal > 0 ? snapshot.totalNegative / sampledTotal : 0.5;
        
        // Weight = (actual ratio) / (sampled ratio)
        // If we oversampled negatives, negativeWeight < 1 to compensate
        const weights = {
            positive: (1 - sampledNegRatio) > 0 ? (1 - actualNegRatio) / (1 - sampledNegRatio) : 1,
            negative: sampledNegRatio > 0 ? actualNegRatio / sampledNegRatio : 1
        };

        // Detect spikes on FULL timeline (not filtered window)
        // A spike is a spike regardless of what slice you're viewing
        const spikeData = this.detectSpikes(buckets, null, weights);
        
        // Filter spikes to only those within the selected window
        const filterSpikesToWindow = (spikes) => {
            if (!filter || !filter.from) return spikes;
            return spikes.filter(s => s.month >= filter.from && s.month <= filter.to);
        };
        
        const windowNegativeSpikes = filterSpikesToWindow(spikeData.negativeSpikes);
        const windowPositiveSpikes = filterSpikesToWindow(spikeData.positiveSpikes);
        
        // Build list of months to exclude (only spikes within current window)
        const excludeMonths = [];
        const total = this.computeCounts(buckets, filter).total;
        
        // Exclude negative spikes above threshold
        for (const spike of windowNegativeSpikes) {
            if (spike.z >= 3 && spike.count >= 50) {
                excludeMonths.push(spike.month);
            }
        }
        
        // Exclude positive spikes only if they meet stricter threshold
        for (const spike of windowPositiveSpikes) {
            if (spike.z >= 4 && spike.count >= 100 && spike.multiple >= 3) {
                excludeMonths.push(spike.month);
            }
        }
        
        // Create organic filter that excludes spike months
        const organicFilter = excludeMonths.length > 0 
            ? { ...filter, excludeMonths } 
            : filter;

        // Review counts (organic, weighted)
        const counts = this.computeCounts(buckets, organicFilter, weights);
        const organicTotal = Math.max(1, counts.total);
        
        // Mass ratios
        const positiveRatio = (counts.positive + counts.uncertainPositive) / organicTotal;
        const negativeRatio = (counts.negative + counts.uncertainNegative) / organicTotal;

        // Playtime distributions (organic, NOT weighted - medians are about shape)
        const posPlaytimes = this.getPlaytimeArray(buckets, 'positive', organicFilter);
        const negPlaytimes = this.getPlaytimeArray(buckets, 'negative', organicFilter);
        const allPlaytimes = [...posPlaytimes, ...negPlaytimes];
        
        const posStats = this.computeStats(posPlaytimes);
        const negStats = this.computeStats(negPlaytimes);
        const allStats = this.computeStats(allPlaytimes);

        // Medians
        const posMedianReview = posStats.median;
        const negMedianReview = negStats.median;
        
        // Total playtime for stockholm (organic, NOT weighted)
        const negTotalPlaytimes = this.getPlaytimeArray(totalBuckets, 'negative', organicFilter);
        const negTotalStats = this.computeStats(negTotalPlaytimes);
        const negMedianTotal = negTotalStats.median;

        // === RATIO-BASED METRICS ===
        const medianRatio = posMedianReview > 0 ? negMedianReview / posMedianReview : 1;
        const stockholmIndex = negMedianReview > 0 ? negMedianTotal / negMedianReview : 1;
        const refundData = isFree ? null : this.computeRefundHonesty(buckets, organicFilter);
        
        // Bimodality detection for negatives (not weighted - internal to negatives)
        const negBimodal = this.detectBimodality(buckets, organicFilter);

        // === STDDEV-BASED METRICS ===
        
        // Tail fatness: % of players beyond 2 stddev (normal distribution = ~2.5%)
        const tailThreshold = allStats.mean + 2 * allStats.stddev;
        const tailRatio = allPlaytimes.length > 0 
            ? allPlaytimes.filter(p => p > tailThreshold).length / allPlaytimes.length
            : 0;
        
        // p95 for addictive check
        const p95Playtime = posStats.p95;
        
        // Temporal drift (with stddev context) - use organic filter to exclude spikes
        const temporalData = this.computeTemporalDrift(buckets, organicFilter, weights);
        const temporalDriftZ = temporalData.stddev > 0 
            ? (temporalData.secondHalfNegRatio - temporalData.firstHalfNegRatio) / temporalData.stddev 
            : 0;
        
        // Window end activity (percentile-based)
        const activityData = this.computeWindowEndActivity(buckets, filter);
        const isEndDead = activityData.isInBottomQuartile;
        
        // Revival detection - use WINDOW, not full timeline
        // If revival happened outside the window you're viewing, don't show it
        const revivalData = this.detectRevival(buckets, filter);

        // Confidence
        const confidence = this.computeConfidence(counts.total);
        const anomalyDensity = snapshot.anomalyIndices.length / buckets.length;

        // Edit heatmap analysis
        const editAnalysis = this.analyzeEditHeatmap(snapshot.editHeatmap);

        // Bundle
        const metricsBundle = {
            counts,
            total,
            positiveRatio,
            negativeRatio,
            posMedianReview,
            negMedianReview,
            negMedianTotal,
            medianRatio,
            stockholmIndex,
            refundPosRate: refundData?.posRate ?? null,
            refundNegRate: refundData?.negRate ?? null,
            negBimodal,
            confidence,
            anomalyDensity,
            isFree,
            isSexual,
            
            // Stats
            posStats,
            negStats,
            allStats,
            p95Playtime,
            tailRatio,
            
            // Sampling weights (for debugging)
            samplingWeights: weights,
            
            // Temporal
            firstHalfNegRatio: temporalData.firstHalfNegRatio,
            secondHalfNegRatio: temporalData.secondHalfNegRatio,
            temporalDriftZ,
            isEndDead,
            
            // Revival (180/360)
            hasRevival: revivalData.hasRevival,
            firstWaveNegRatio: revivalData.firstWaveNegRatio,
            lastWaveNegRatio: revivalData.lastWaveNegRatio,
            revivalSentimentChange: revivalData.revivalSentimentChange,
            isStillAlive: revivalData.isStillAlive,
            
            // Spikes (window-filtered for display, detected on full timeline)
            negativeSpikes: windowNegativeSpikes,
            positiveSpikes: windowPositiveSpikes,
            negativeBombZ: windowNegativeSpikes[0]?.z || 0,
            negativeBombMonth: windowNegativeSpikes[0]?.month || null,
            negativeBombMultiple: windowNegativeSpikes[0]?.multiple || 0,
            negativeBombCount: windowNegativeSpikes[0]?.count || 0,
            positiveBombZ: windowPositiveSpikes[0]?.z || 0,
            positiveBombMonth: windowPositiveSpikes[0]?.month || null,
            positiveBombMultiple: windowPositiveSpikes[0]?.multiple || 0,
            positiveBombCount: windowPositiveSpikes[0]?.count || 0,
            excludedMonths: excludeMonths,
            
            // Edit analysis
            recentNegativeEditRatio: editAnalysis.recentNegativeEditRatio,
            oldReviewsEditedRatio: editAnalysis.oldReviewsEditedRatio,
            totalEdits: editAnalysis.totalEdits
        };

        // Derive tags
        const verdict = this.deriveVerdict(metricsBundle);

        return {
            ...metricsBundle,
            verdict
        };
    },

    /**
     * Get array of playtimes for statistical analysis
     * NOT weighted - medians reflect actual sample shape, not corrected ratios
     */
    getPlaytimeArray(buckets, type, filter) {
        const values = [];
        
        for (const bucket of buckets) {
            const f = this.filterBucket(bucket, filter);
            const midpoint = (bucket.minPlaytime + bucket.maxPlaytime) / 2;
            const count = type === 'positive' 
                ? f.pos + f.uncPos 
                : f.neg + f.uncNeg;
            
            for (let i = 0; i < count; i++) {
                values.push(midpoint);
            }
        }
        
        return values;
    },

    /**
     * Compute statistics from an array of values
     */
    computeStats(values) {
        if (values.length === 0) {
            return { mean: 0, median: 0, stddev: 0, p95: 0 };
        }
        
        const sorted = [...values].sort((a, b) => a - b);
        const n = sorted.length;
        
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const median = sorted[Math.floor(n / 2)];
        const p95 = sorted[Math.floor(n * 0.95)];
        
        const squaredDiffs = values.map(v => (v - mean) ** 2);
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / n;
        const stddev = Math.sqrt(variance);
        
        return { mean, median, stddev, p95 };
    },

    /**
     * Detect bimodal distribution in negatives
     * Extraction signature: some bounce early (<20h), some get trapped late (>100h)
     * Both clusters need significant mass (>15% each) to count as bimodal
     * NOT weighted - this is about shape within negatives, not pos/neg ratio
     */
    detectBimodality(buckets, filter) {
        const earlyThreshold = 20 * 60;  // 20 hours in minutes
        const lateThreshold = 100 * 60;  // 100 hours in minutes
        const minClusterRatio = 0.15;    // Each cluster needs 15%+ of negatives
        
        let earlyCount = 0;
        let lateCount = 0;
        let totalNeg = 0;
        
        for (const bucket of buckets) {
            const filtered = this.filterBucket(bucket, filter);
            const neg = filtered.neg + filtered.uncNeg;
            totalNeg += neg;
            
            const midpoint = (bucket.minPlaytime + bucket.maxPlaytime) / 2;
            
            if (midpoint < earlyThreshold) {
                earlyCount += neg;
            } else if (midpoint > lateThreshold) {
                lateCount += neg;
            }
        }
        
        if (totalNeg < 50) {
            return { isBimodal: false, earlyRatio: 0, lateRatio: 0, totalNeg };
        }
        
        const earlyRatio = earlyCount / totalNeg;
        const lateRatio = lateCount / totalNeg;
        
        // Bimodal if both clusters have significant mass
        const isBimodal = earlyRatio >= minClusterRatio && lateRatio >= minClusterRatio;
        
        return {
            isBimodal,
            earlyRatio,
            lateRatio,
            earlyCount,
            lateCount,
            totalNeg
        };
    },

    /**
     * Compute temporal drift - compare RECENT (last 12 months) vs EARLIER
     * This catches "game is getting worse NOW" better than arbitrary halves
     */
    computeTemporalDrift(buckets, filter, weights = null) {
        const allMonths = new Set();
        for (const bucket of buckets) {
            for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
        }

        let sortedMonths = [...allMonths].sort();
        
        if (filter) {
            sortedMonths = sortedMonths.filter(m => {
                if (filter.from && m < filter.from) return false;
                if (filter.to && m > filter.to) return false;
                if (filter.excludeMonths && filter.excludeMonths.includes(m)) return false;
                return true;
            });
        }
        
        if (sortedMonths.length < 6) {
            return { firstHalfNegRatio: 0, secondHalfNegRatio: 0, stddev: 0 };
        }

        const posWeight = weights?.positive || 1;
        const negWeight = weights?.negative || 1;

        // Compute monthly negative ratios for stddev (weighted)
        const monthlyRatios = [];
        for (const month of sortedMonths) {
            let pos = 0, neg = 0;
            for (const bucket of buckets) {
                pos += ((bucket.positiveByMonth?.[month] || 0) + (bucket.uncertainPositiveByMonth?.[month] || 0)) * posWeight;
                neg += ((bucket.negativeByMonth?.[month] || 0) + (bucket.uncertainNegativeByMonth?.[month] || 0)) * negWeight;
            }
            if (pos + neg > 0) {
                monthlyRatios.push(neg / (pos + neg));
            }
        }
        
        // Split: last 12 months vs everything before
        const recentMonths = 12;
        const cutoff = Math.max(0, sortedMonths.length - recentMonths);
        const earlierPeriod = { from: sortedMonths[0], to: sortedMonths[cutoff - 1] || sortedMonths[0], excludeMonths: filter?.excludeMonths };
        const recentPeriod = { from: sortedMonths[cutoff], to: sortedMonths[sortedMonths.length - 1], excludeMonths: filter?.excludeMonths };

        const earlierCounts = this.computeCounts(buckets, earlierPeriod, weights);
        const recentCounts = this.computeCounts(buckets, recentPeriod, weights);
        
        const firstHalfNegRatio = earlierCounts.total > 0 
            ? (earlierCounts.negative + earlierCounts.uncertainNegative) / earlierCounts.total 
            : 0;
        const secondHalfNegRatio = recentCounts.total > 0 
            ? (recentCounts.negative + recentCounts.uncertainNegative) / recentCounts.total 
            : 0;
        
        const ratioStats = this.computeStats(monthlyRatios);

        return { 
            firstHalfNegRatio, 
            secondHalfNegRatio, 
            stddev: ratioStats.stddev || 0.1
        };
    },

    /**
     * Get monthly activity data from buckets
     * @param buckets - histogram buckets
     * @param filter - optional filter for window
     * @returns { months: string[], activity: {month, count, pos, neg}[], p25: number, p75: number }
     */
    getMonthlyActivityData(buckets, filter = null) {
        const allMonths = new Set();
        for (const bucket of buckets) {
            for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.uncertainPositiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.uncertainNegativeByMonth || {})) allMonths.add(month);
        }
        
        let sortedMonths = [...allMonths].sort();
        
        if (filter && filter.from) {
            sortedMonths = sortedMonths.filter(m => m >= filter.from && m <= filter.to);
        }
        
        const activity = sortedMonths.map(month => {
            let pos = 0, neg = 0;
            for (const bucket of buckets) {
                pos += (bucket.positiveByMonth?.[month] || 0) + (bucket.uncertainPositiveByMonth?.[month] || 0);
                neg += (bucket.negativeByMonth?.[month] || 0) + (bucket.uncertainNegativeByMonth?.[month] || 0);
            }
            return { month, pos, neg, count: pos + neg };
        });
        
        if (activity.length === 0) {
            return { months: [], activity: [], p25: 0, p75: 0 };
        }
        
        const sortedByCount = [...activity].sort((a, b) => a.count - b.count);
        const p10 = sortedByCount[Math.floor(sortedByCount.length * 0.10)].count;
        const p25 = sortedByCount[Math.floor(sortedByCount.length * 0.25)].count;
        const p75 = sortedByCount[Math.floor(sortedByCount.length * 0.75)].count;
        
        return { months: sortedMonths, activity, p10, p25, p75 };
    },

    /**
     * Compute window end activity - detect DYING (was alive, now dead)
     * Compare end of window to earlier activity in same window
     */
    computeWindowEndActivity(buckets, filter) {
        const windowData = this.getMonthlyActivityData(buckets, filter);
        
        if (windowData.activity.length < 6) {
            return { endActivity: 1, startActivity: 1, isInBottomQuartile: false };
        }
        
        const activity = windowData.activity;
        
        // First half activity (average)
        const firstHalfCount = Math.floor(activity.length / 2);
        const firstHalf = activity.slice(0, firstHalfCount);
        const startActivity = firstHalf.reduce((sum, m) => sum + m.count, 0) / firstHalf.length;
        
        // Last 3 months activity (average)
        const endMonths = activity.slice(-3);
        const endActivity = endMonths.reduce((sum, m) => sum + m.count, 0) / endMonths.length;
        
        // Dead if end activity is less than 20% of start activity (80%+ decline)
        const isInBottomQuartile = startActivity > 0 && endActivity < startActivity * 0.2;
        
        return {
            endActivity,
            startActivity,
            isInBottomQuartile
        };
    },

    /**
     * Detect revival pattern - game died, came back
     * Death = activity dropped to <20% of previous levels (consistent with DEAD logic)
     */
    detectRevival(buckets, filter) {
        const windowData = this.getMonthlyActivityData(buckets, filter);
        
        if (windowData.activity.length < 6) {
            return { hasRevival: false };
        }
        
        const activity = windowData.activity;
        
        // Find death/revival pattern using relative decline
        // Death = 3+ consecutive months at <20% of prior activity
        // Revival = jump back to >50% of prior activity
        let hasRevival = false;
        let firstWaveData = { pos: 0, neg: 0 };
        let lastWaveData = { pos: 0, neg: 0 };
        let deathStartIdx = -1;
        
        // Calculate rolling average (3 month window) to smooth noise
        const getAvg = (start, end) => {
            const slice = activity.slice(start, end);
            return slice.length > 0 ? slice.reduce((sum, m) => sum + m.count, 0) / slice.length : 0;
        };
        
        // Look for death: activity drops to <20% of previous 6 month average
        for (let i = 6; i < activity.length - 3; i++) {
            const priorAvg = getAvg(i - 6, i);
            const currentAvg = getAvg(i, i + 3);
            
            if (priorAvg > 0 && currentAvg < priorAvg * 0.2) {
                // Found death, now look for revival
                for (let j = i + 3; j < activity.length - 2; j++) {
                    const revivalAvg = getAvg(j, j + 3);
                    if (revivalAvg >= priorAvg * 0.5) {
                        // Found revival
                        hasRevival = true;
                        deathStartIdx = i;
                        
                        // First wave = everything before death
                        for (let k = 0; k < i; k++) {
                            firstWaveData.pos += activity[k].pos;
                            firstWaveData.neg += activity[k].neg;
                        }
                        // Last wave = from revival onwards
                        for (let k = j; k < activity.length; k++) {
                            lastWaveData.pos += activity[k].pos;
                            lastWaveData.neg += activity[k].neg;
                        }
                        break;
                    }
                }
                if (hasRevival) break;
            }
        }
        
        if (!hasRevival) {
            return { hasRevival: false };
        }
        
        const firstWaveNegRatio = firstWaveData.neg / Math.max(1, firstWaveData.pos + firstWaveData.neg);
        const lastWaveNegRatio = lastWaveData.neg / Math.max(1, lastWaveData.pos + lastWaveData.neg);
        
        // Is it still alive? Same logic as DEAD - compare end to earlier post-revival
        const postRevivalStart = deathStartIdx + 6; // rough estimate
        const postRevivalActivity = activity.slice(postRevivalStart);
        if (postRevivalActivity.length < 6) {
            return { hasRevival: true, firstWaveNegRatio, lastWaveNegRatio, revivalSentimentChange: lastWaveNegRatio - firstWaveNegRatio, isStillAlive: true };
        }
        
        const firstHalf = postRevivalActivity.slice(0, Math.floor(postRevivalActivity.length / 2));
        const startActivity = firstHalf.reduce((sum, m) => sum + m.count, 0) / firstHalf.length;
        const endMonths = activity.slice(-3);
        const endActivity = endMonths.reduce((sum, m) => sum + m.count, 0) / endMonths.length;
        const isStillAlive = startActivity === 0 || endActivity >= startActivity * 0.2;
        
        return {
            hasRevival: true,
            firstWaveNegRatio,
            lastWaveNegRatio,
            revivalSentimentChange: lastWaveNegRatio - firstWaveNegRatio,
            isStillAlive
        };
    },

    /**
     * Detect review spikes (bombs or botting)
     * Uses LOCAL comparison: each month vs its ±3 month neighbors
     * Returns ALL spikes above threshold, not just the biggest
     */
    detectSpikes(buckets, filter, weights = null) {
        const allMonths = new Set();
        for (const bucket of buckets) {
            for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
        }
        
        let sortedMonths = [...allMonths].sort();
        if (filter) {
            sortedMonths = sortedMonths.filter(m => m >= filter.from && m <= filter.to);
        }
        
        if (sortedMonths.length < 3) {
            return {
                negativeSpikes: [], positiveSpikes: [],
                negativeBombZ: 0, negativeBombMonth: null, negativeBombMultiple: 0, negativeBombCount: 0,
                positiveBombZ: 0, positiveBombMonth: null, positiveBombMultiple: 0, positiveBombCount: 0
            };
        }
        
        // Count monthly positives and negatives
        const monthlyData = [];
        
        for (const month of sortedMonths) {
            let pos = 0, neg = 0;
            for (const bucket of buckets) {
                pos += (bucket.positiveByMonth?.[month] || 0) + (bucket.uncertainPositiveByMonth?.[month] || 0);
                neg += (bucket.negativeByMonth?.[month] || 0) + (bucket.uncertainNegativeByMonth?.[month] || 0);
            }
            monthlyData.push({ month, pos, neg, total: pos + neg });
        }
        
        // Find ALL spikes using LOCAL comparison (rolling window) on TOTAL activity
        const windowSize = 3; // +/-3 months = 7 month window
        const spikeThreshold = 2.5; // Z-score threshold for spike detection
        
        const negativeSpikes = [];
        const positiveSpikes = [];
        
        for (let i = 0; i < monthlyData.length; i++) {
            const m = monthlyData[i];
            
            // Get neighbors (excluding self)
            const neighbors = [];
            for (let j = Math.max(0, i - windowSize); j <= Math.min(monthlyData.length - 1, i + windowSize); j++) {
                if (j !== i) neighbors.push(monthlyData[j].total);
            }
            
            if (neighbors.length < 2) continue;
            
            const localStats = this.computeStats(neighbors);
            if (localStats.stddev === 0) continue;
            
            const z = localStats.stddev > 0 ? (m.total - localStats.mean) / localStats.stddev : 0;
            
            // Launch weight: discount early months (month 0 = 0%, month 6 = 63%, month 12 = 86%)
            const launchWeight = 1 - Math.exp(-i / 6);
            const effectiveZ = z * launchWeight;
            
            if (effectiveZ >= spikeThreshold) {
                // Determine if this is a negative or positive spike based on sentiment
                // >2/3 negative = review bomb, >2/3 positive = surge
                const negRatio = m.total > 0 ? m.neg / m.total : 0;
                const spikeData = {
                    month: m.month,
                    z: effectiveZ,
                    rawZ: z,
                    multiple: localStats.mean > 0 ? m.total / localStats.mean : m.total,
                    count: m.total,
                    negCount: m.neg,
                    posCount: m.pos,
                    negRatio,
                    launchWeight
                };
                
                if (negRatio > 2/3) {
                    negativeSpikes.push(spikeData);
                } else if (negRatio < 1/3) {
                    positiveSpikes.push(spikeData);
                }
                // If between 1/3 and 2/3, it's mixed - not a bomb or surge, ignore it
            }
        }
        
        // Sort by Z-score descending
        negativeSpikes.sort((a, b) => b.z - a.z);
        positiveSpikes.sort((a, b) => b.z - a.z);
        
        // For backwards compat, also return the biggest spike in old format
        const biggestNeg = negativeSpikes[0] || { z: 0, month: null, multiple: 0, count: 0 };
        const biggestPos = positiveSpikes[0] || { z: 0, month: null, multiple: 0, count: 0 };
        
        return {
            negativeSpikes,
            positiveSpikes,
            // Legacy fields for biggest spike
            negativeBombZ: biggestNeg.z,
            negativeBombMonth: biggestNeg.month,
            negativeBombMultiple: biggestNeg.multiple,
            negativeBombCount: biggestNeg.count,
            positiveBombZ: biggestPos.z,
            positiveBombMonth: biggestPos.month,
            positiveBombMultiple: biggestPos.multiple,
            positiveBombCount: biggestPos.count
        };
    },

    /**
     * Run all tag conditions and stack results
     */
    deriveVerdict(m) {
        let tags = [];
        let totalSeverity = 0;

        for (const def of this.tagDefinitions) {
            try {
                if (def.condition(m)) {
                    const severity = typeof def.severity === 'function' ? def.severity(m) : def.severity;
                    const reason = typeof def.reason === 'function' ? def.reason(m) : def.reason;
                    
                    tags.push({
                        id: def.id,
                        severity,
                        reason,
                        color: def.color
                    });
                    
                    totalSeverity += severity;
                }
            } catch (e) {
                console.warn(`Tag ${def.id} failed:`, e);
            }
        }

        tags = tags.filter(t => {
            const dominated_by = Object.entries(Metrics.hierarchies)
                .filter(([superior, inferiors]) => inferiors.includes(t.id) && tags.some(x => x.id === superior));
            return dominated_by.length === 0;
        });

        tags.sort((a, b) => Math.abs(b.severity) - Math.abs(a.severity));

        const primaryTag = tags[0]?.id || 'NEUTRAL';
        const normalizedSeverity = Math.max(0, Math.min(1, (totalSeverity + 0.3) / 0.6));

        return {
            tags,
            primaryTag,
            severity: normalizedSeverity,
            rawSeverity: totalSeverity,
            reasons: tags.map(t => t.reason)
        };
    },

    /**
     * Compute total review counts (weighted)
     */
    computeCounts(buckets, filter = null, weights = null) {
        let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;
        const posWeight = weights?.positive || 1;
        const negWeight = weights?.negative || 1;

        for (const bucket of buckets) {
            const filtered = this.filterBucket(bucket, filter);
            pos += filtered.pos * posWeight;
            neg += filtered.neg * negWeight;
            uncPos += filtered.uncPos * posWeight;
            uncNeg += filtered.uncNeg * negWeight;
        }

        return {
            positive: pos,
            negative: neg,
            uncertainPositive: uncPos,
            uncertainNegative: uncNeg,
            certain: pos + neg,
            uncertain: uncPos + uncNeg,
            total: pos + neg + uncPos + uncNeg
        };
    },

    /**
     * What percentage of positive/negative reviews came before the 2h refund window?
     */
    computeRefundHonesty(buckets, filter = null) {
        let posBeforeRefund = 0, negBeforeRefund = 0;
        let posTotal = 0, negTotal = 0;

        for (const bucket of buckets) {
            const filtered = this.filterBucket(bucket, filter);
            const pos = filtered.pos + filtered.uncPos;
            const neg = filtered.neg + filtered.uncNeg;
            posTotal += pos;
            negTotal += neg;

            if (bucket.maxPlaytime <= 120) {
                posBeforeRefund += pos;
                negBeforeRefund += neg;
            } else if (bucket.minPlaytime < 120) {
                const ratio = (120 - bucket.minPlaytime) / (bucket.maxPlaytime - bucket.minPlaytime);
                posBeforeRefund += pos * ratio;
                negBeforeRefund += neg * ratio;
            }
        }

        return {
            posRate: posTotal > 0 ? posBeforeRefund / posTotal : 0,
            negRate: negTotal > 0 ? negBeforeRefund / negTotal : 0
        };
    },

    /**
     * Confidence based on sample size
     */
    computeConfidence(sampleSize) {
        if (sampleSize < 100) return 0.1;
        if (sampleSize < 500) return 0.3;
        if (sampleSize < 1000) return 0.5;
        if (sampleSize < 5000) return 0.7;
        if (sampleSize < 10000) return 0.85;
        return 1.0;
    },

    /**
     * Filter bucket counts by timeline range and excluded months
     */
    filterBucket(bucket, filter) {
        if (!filter) {
            return {
                pos: bucket.positiveCount,
                neg: bucket.negativeCount,
                uncPos: bucket.uncertainPositiveCount,
                uncNeg: bucket.uncertainNegativeCount
            };
        }

        const excludeSet = new Set(filter.excludeMonths || []);
        let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;

        for (const [month, count] of Object.entries(bucket.positiveByMonth || {})) {
            if (this.monthInRange(month, filter) && !excludeSet.has(month)) pos += count;
        }
        for (const [month, count] of Object.entries(bucket.negativeByMonth || {})) {
            if (this.monthInRange(month, filter) && !excludeSet.has(month)) neg += count;
        }
        for (const [month, count] of Object.entries(bucket.uncertainPositiveByMonth || {})) {
            if (this.monthInRange(month, filter) && !excludeSet.has(month)) uncPos += count;
        }
        for (const [month, count] of Object.entries(bucket.uncertainNegativeByMonth || {})) {
            if (this.monthInRange(month, filter) && !excludeSet.has(month)) uncNeg += count;
        }

        return { pos, neg, uncPos, uncNeg };
    },
    
    /**
     * Check if month is in filter range (or no range specified)
     */
    monthInRange(month, filter) {
        if (!filter || (!filter.from && !filter.to)) return true;
        if (filter.from && month < filter.from) return false;
        if (filter.to && month > filter.to) return false;
        return true;
    },

    /**
     * Analyze edit heatmap for sentiment revision patterns
     * Returns: recentNegativeEditRatio, oldReviewsEditedRatio, totalEdits
     */
    analyzeEditHeatmap(editHeatmap) {
        if (!editHeatmap || !editHeatmap.months || editHeatmap.months.length < 6) {
            return { recentNegativeEditRatio: 0, oldReviewsEditedRatio: 0, totalEdits: 0 };
        }
        
        const months = editHeatmap.months;
        const cells = editHeatmap.cells || {};
        const n = months.length;
        
        // "Recent" = last 6 months of edit times
        const recentEditMonths = new Set(months.slice(-6));
        // "Old reviews" = posted in first half of timeline
        const oldPostMonths = new Set(months.slice(0, Math.floor(n / 2)));
        
        let totalEdits = 0;
        let recentEdits = 0;
        let recentNegativeEdits = 0;
        let oldReviewsEdited = 0;
        let totalOldReviews = 0; // We don't have this, so we approximate
        
        for (const [key, cell] of Object.entries(cells)) {
            const [postedMonth, editedMonth] = key.split('|');
            const count = cell.positive + cell.negative;
            
            // Skip same-month edits (not really "revisions")
            if (postedMonth === editedMonth) continue;
            
            totalEdits += count;
            
            // Recent edits = edited in last 6 months
            if (recentEditMonths.has(editedMonth)) {
                recentEdits += count;
                recentNegativeEdits += cell.negative;
            }
            
            // Old reviews being edited = posted in first half, edited later
            if (oldPostMonths.has(postedMonth) && editedMonth > postedMonth) {
                oldReviewsEdited += count;
            }
        }
        
        // Approximate old reviews count (we use totalEdits as proxy - not perfect)
        // Better: count cells where postedMonth is in first half
        for (const [key, cell] of Object.entries(cells)) {
            const [postedMonth] = key.split('|');
            if (oldPostMonths.has(postedMonth)) {
                totalOldReviews += cell.positive + cell.negative;
            }
        }
        
        return {
            recentNegativeEditRatio: recentEdits > 0 ? recentNegativeEdits / recentEdits : 0,
            oldReviewsEditedRatio: totalOldReviews > 0 ? oldReviewsEdited / totalOldReviews : 0,
            totalEdits
        };
    },

    /**
     * Slide a window across the timeline and detect tags at each position
     * @param snapshot - full analysis snapshot
     * @param windowMonths - window size in months (default 3)
     * @param options - isFree, isSexual
     * @returns Array of { month, tags: string[], negRatio, volume }
     */
    computeTimeline(snapshot, windowMonths = 3, options = {}) {
        const buckets = snapshot.bucketsByReviewTime;
        
        // Get all months
        const allMonths = new Set();
        for (const bucket of buckets) {
            for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
        }
        const sortedMonths = [...allMonths].sort();
        
        if (sortedMonths.length < windowMonths) {
            return [];
        }
        
        const timeline = [];
        
        // Slide window across timeline
        for (let i = 0; i <= sortedMonths.length - windowMonths; i++) {
            const windowStart = sortedMonths[i];
            const windowEnd = sortedMonths[i + windowMonths - 1];
            const filter = { from: windowStart, to: windowEnd };
            
            // Compute metrics for this window
            const metrics = this.compute(snapshot, { 
                timelineFilter: filter, 
                isFree: options.isFree, 
                isSexual: options.isSexual,
                convergenceScore: 1 // assume converged for timeline
            });
            
            timeline.push({
                month: windowEnd, // label by end of window
                windowStart,
                windowEnd,
                tags: metrics.verdict.tags.map(t => t.id),
                negRatio: metrics.negativeRatio,
                volume: metrics.counts.total,
                medianRatio: metrics.medianRatio
            });
        }
        
        return timeline;
    }
};

window.Metrics = Metrics;
