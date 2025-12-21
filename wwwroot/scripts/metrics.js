/**
 * Metrics module for gamersremorse
 * Pure analysis functions - no UI, no side effects
 * 
 * Two types of metrics:
 * 1. RATIO-BASED: Comparing two groups (positive vs negative). Thresholds are intuitive percentages.
 * 2. STDDEV-BASED: Detecting unusual patterns within a distribution. Thresholds are statistical.
 * 
 * PROJECTION SYSTEM:
 * We sample a subset of reviews but know the TRUE totals from Steam.
 * Projection extrapolates our sample to represent the full distribution.
 * - Sampled data = solid bars (what we actually observed)
 * - Projected data = faded bars (what we estimate exists but haven't sampled)
 */

const Metrics = {
    hierarchies: {
        // Key beats Values
        'PREDATORY': ['EXTRACTIVE'],
        'EXTRACTIVE': ['TROUBLED'],
        'FLOP': ['TROUBLED'],
        'TROUBLED': ['HONEST', 'HEALTHY'],
        'DEAD': ['HEALTHY'],
        'ENSHITTIFIED': ['RETCONNED', 'HONEYMOON'],
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
            condition: (m) => m.medianRatio > 1.3,
            reason: (m) => `${Math.round(m.negativeRatio * 100)}% negative at ${Math.round(m.negMedianReview / 60)}h (${Math.round((m.medianRatio - 1) * 100)}% longer than positives)`,
            severity: (m) => Math.min(0.3, (m.medianRatio - 1) * 0.3),
            color: 'var(--color-tag-extractive)'
        },
        {
            id: 'SIREN',
            condition: (m) => m.posMedianReview > m.negMedianReview && m.posMedianTotal < m.negMedianTotal,
            reason: (m) => `Pretty until the ${Math.round((m.posMedianReview + m.negMedianReview) / 2 / 60)}h mark; turns ugly around ${Math.round((m.posMedianTotal + m.negMedianTotal) / 2 / 60)}h.`,
            severity: (m) => Math.min(0.3, (m.medianRatio - 1) * 0.3),
            color: 'var(--color-tag-siren)'
        },
        {
            id: 'ENSHITTIFIED',
            condition: (m) => {
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
        // ============================================================
        {
            id: 'DEAD',
            condition: (m) => m.isEndDead,
            reason: (m) => `Activity declined - tail end is dead`,
            severity: 0.01,
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
        // REVIVAL TAGS
        // ============================================================
        {
            id: 'PHOENIX',
            condition: (m) => m.hasRevival && m.firstWaveNegRatio < 0.5 && m.lastWaveNegRatio < 0.5 && m.isStillAlive,
            reason: (m) => `Rose from ashes: ${Math.round((1 - m.firstWaveNegRatio) * 100)}% → ${Math.round((1 - m.lastWaveNegRatio) * 100)}% positive, still flying`,
            severity: -0.15,
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
            reason: (m) => `Only ${Math.round(m.sampledTotal)} reviews - interpret with caution`,
            severity: 0,
            color: 'var(--color-tag-low-data)'
        },
        {
            id: 'REVIEW_BOMBED',
            condition: (m) => m.negativeSpikes?.length > 0 && m.negativeSpikes.some(s => {
                // Volume spike with high neg ratio, OR sentiment spike
                const hasVolume = s.isVolumeSpike && s.count >= 50;
                const hasSentiment = s.isSentimentSpike && s.sentimentZ >= 2;
                return hasVolume || hasSentiment;
            }),
            reason: (m) => {
                const significant = m.negativeSpikes.filter(s => {
                    const hasVolume = s.isVolumeSpike && s.count >= 50;
                    const hasSentiment = s.isSentimentSpike && s.sentimentZ >= 2;
                    return hasVolume || hasSentiment;
                });
                const totalCount = significant.reduce((sum, s) => sum + s.count, 0);
                const months = significant.map(s => s.month).join(', ');
                const types = significant.map(s => {
                    if (s.isVolumeSpike && s.isSentimentSpike) return 'both';
                    if (s.isVolumeSpike) return 'volume';
                    return 'sentiment';
                });
                const hasSentimentOnly = types.some(t => t === 'sentiment');
                const suffix = hasSentimentOnly ? ' (sentiment spike)' : '';
                return `${significant.length} negative surge${significant.length > 1 ? 's' : ''} (${months})${suffix}: ${totalCount} reviews excluded`;
            },
            severity: 0,
            color: 'var(--color-tag-review-bombed)'
        },
        {
            id: 'SURGE',
            condition: (m) => m.positiveSpikes?.length > 0 && m.positiveSpikes.some(s => {
                const hasVolume = s.isVolumeSpike && s.count >= 100 && s.multiple >= 3;
                const hasSentiment = s.isSentimentSpike && s.sentimentZ <= -2;
                return hasVolume || hasSentiment;
            }),
            reason: (m) => {
                const significant = m.positiveSpikes.filter(s => {
                    const hasVolume = s.isVolumeSpike && s.count >= 100 && s.multiple >= 3;
                    const hasSentiment = s.isSentimentSpike && s.sentimentZ <= -2;
                    return hasVolume || hasSentiment;
                });
                const months = significant.map(s => s.month).join(', ');
                return `Viral moment in ${months} (excluded from stats)`;
            },
            severity: 0,
            color: 'var(--color-tag-surge)'
        },
        {
            id: 'RETCONNED',
            condition: (m) => m.recentNegativeEditRatio >= 0.25 && m.oldReviewsEditedRatio >= 0.50 && m.totalEdits >= 1000
                           || m.recentNegativeEditRatio >= 0.50 && m.oldReviewsEditedRatio >= 0.25 && m.totalEdits >= 1000,
            reason: (m) => `${Math.round(m.recentNegativeEditRatio * 100)}% of recent edits negative, ${Math.round(m.oldReviewsEditedRatio * 100)}% of old reviews revised`,
            severity: 0.1,
            color: 'var(--color-tag-retconned)'
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

        // Extract sampling metadata
        const gameTotal = snapshot.gameTotalPositive + snapshot.gameTotalNegative;
        const sampledTotal = snapshot.totalPositive + snapshot.totalNegative;
        
        // Sample rates
        const positiveSampleRate = snapshot.positiveSampleRate ?? 
            (snapshot.gameTotalPositive > 0 ? snapshot.totalPositive / snapshot.gameTotalPositive : 1);
        const negativeSampleRate = snapshot.negativeSampleRate ?? 
            (snapshot.gameTotalNegative > 0 ? snapshot.totalNegative / snapshot.gameTotalNegative : 1);
        
        // Convergence score
        const convergenceScore = Math.min(positiveSampleRate, negativeSampleRate);
        
        // True ratio from Steam (global)
        const actualNegRatio = gameTotal > 0 ? snapshot.gameTotalNegative / gameTotal : 0.5;
        const actualPosRatio = 1 - actualNegRatio;

        // Use prediction unless explicitly hidden
        const usePrediction = !options.hidePrediction;
        const predictionSnapshot = usePrediction ? snapshot : null;

        // Detect spikes (using predicted data if enabled)
        const spikeData = this.detectSpikes(buckets, null, predictionSnapshot);
        
        const filterSpikesToWindow = (spikes) => {
            if (!filter || !filter.from) return spikes;
            return spikes.filter(s => s.month >= filter.from && s.month <= filter.to);
        };
        
        const windowNegativeSpikes = filterSpikesToWindow(spikeData.negativeSpikes);
        const windowPositiveSpikes = filterSpikesToWindow(spikeData.positiveSpikes);
        
        const excludeMonths = [];
        for (const spike of windowNegativeSpikes) {
            // Exclude if volume spike with enough count, OR sentiment spike
            const hasVolume = spike.isVolumeSpike && spike.count >= 50;
            const hasSentiment = spike.isSentimentSpike && spike.sentimentZ >= 2;
            if (hasVolume || hasSentiment) excludeMonths.push(spike.month);
        }
        for (const spike of windowPositiveSpikes) {
            const hasVolume = spike.isVolumeSpike && spike.count >= 100 && spike.multiple >= 3;
            const hasSentiment = spike.isSentimentSpike && spike.sentimentZ <= -2;
            if (hasVolume || hasSentiment) excludeMonths.push(spike.month);
        }
        
        const organicFilter = excludeMonths.length > 0 ? { ...filter, excludeMonths } : filter;

        // Get PROJECTED counts (for overall metrics)
        const projected = this.projectCounts(buckets, organicFilter, snapshot);
        const projectedTotal = Math.max(1, projected.total);
        
        // Ratios: use WINDOW data if filtered, otherwise global Steam totals
        // This allows tags like FLOP to trigger when viewing launch window
        let positiveRatio, negativeRatio;
        if (filter && filter.from) {
            if (usePrediction) {
                // Use predicted monthly data for the window
                const predictedMonthly = this.getPredictedMonthlyData(buckets, organicFilter, snapshot);
                let windowPos = 0, windowNeg = 0;
                for (const m of predictedMonthly) {
                    windowPos += m.projectedPos || m.pos || 0;
                    windowNeg += m.projectedNeg || m.neg || 0;
                }
                const windowTotal = windowPos + windowNeg;
                positiveRatio = windowTotal > 0 ? windowPos / windowTotal : 0.5;
                negativeRatio = windowTotal > 0 ? windowNeg / windowTotal : 0.5;
            } else {
                // Use raw sampled counts for the window
                const sampled = this.computeSampledCounts(buckets, organicFilter);
                const windowPos = sampled.positive + sampled.uncertainPositive;
                const windowNeg = sampled.negative + sampled.uncertainNegative;
                const windowTotal = windowPos + windowNeg;
                positiveRatio = windowTotal > 0 ? windowPos / windowTotal : 0.5;
                negativeRatio = windowTotal > 0 ? windowNeg / windowTotal : 0.5;
            }
        } else {
            // Use global Steam ground truth
            positiveRatio = actualPosRatio;
            negativeRatio = actualNegRatio;
        }

        // Playtime distributions
        const posPlaytimes = this.getPlaytimeArray(buckets, 'positive', organicFilter);
        const negPlaytimes = this.getPlaytimeArray(buckets, 'negative', organicFilter);
        const allPlaytimes = [...posPlaytimes, ...negPlaytimes];
        const totalPosPlaytimes = this.getPlaytimeArray(totalBuckets, 'positive', organicFilter);
        const totalNegPlaytimes = this.getPlaytimeArray(totalBuckets, 'negative', organicFilter);

        const posStats = this.computeStats(posPlaytimes);
        const negStats = this.computeStats(negPlaytimes);
        const allStats = this.computeStats(allPlaytimes);
        const totalPosStats = this.computeStats(totalPosPlaytimes);
        const totalNegStats = this.computeStats(totalNegPlaytimes);

        const posMedianReview = posStats.median;
        const negMedianReview = negStats.median;
        const posMedianTotal = totalPosStats.median;
        const negMedianTotal = totalNegStats.median;
        const posMedianDelta = posMedianTotal - posMedianReview;
        const negMedianDelta = negMedianTotal - negMedianReview;
        const medianDeltaRatio = posMedianDelta > 0 ? negMedianDelta / posMedianDelta : 1;

        const medianRatio = posMedianReview > 0 ? negMedianReview / posMedianReview : 1;
        const stockholmIndex = negMedianReview > 0 ? negMedianTotal / negMedianReview : 1;
        const refundData = isFree ? null : this.computeRefundHonesty(buckets, organicFilter);
        const negBimodal = this.detectBimodality(buckets, organicFilter);

        const tailThreshold = allStats.mean + 2 * allStats.stddev;
        const tailRatio = allPlaytimes.length > 0 
            ? allPlaytimes.filter(p => p > tailThreshold).length / allPlaytimes.length : 0;
        const p95Playtime = posStats.p95;
        
        const temporalData = this.computeTemporalDrift(buckets, organicFilter, snapshot);
        const temporalDriftZ = temporalData.stddev > 0 
            ? (temporalData.secondHalfNegRatio - temporalData.firstHalfNegRatio) / temporalData.stddev : 0;
        
        const activityData = this.computeWindowEndActivity(buckets, filter, predictionSnapshot);
        const isEndDead = activityData.isInBottomQuartile;
        const revivalData = this.detectRevival(buckets, filter, predictionSnapshot);

        const confidence = this.computeConfidence(sampledTotal) * Math.sqrt(Math.max(0.1, convergenceScore));
        const editAnalysis = this.analyzeEditHeatmap(snapshot.editHeatmap);

        const metricsBundle = {
            counts: projected,
            total: projectedTotal,
            sampledTotal,
            positiveRatio,
            negativeRatio,
            posMedianReview,
            negMedianReview,
            posMedianTotal,
            negMedianTotal,
            posMedianDelta,
            negMedianDelta,
            medianRatio,
            medianDeltaRatio,
            stockholmIndex,
            refundPosRate: refundData?.posRate ?? null,
            refundNegRate: refundData?.negRate ?? null,
            negBimodal,
            confidence,
            convergenceScore,
            isFree,
            isSexual,
            posStats,
            negStats,
            allStats,
            p95Playtime,
            tailRatio,
            positiveSampleRate,
            negativeSampleRate,
            positiveExhausted: snapshot.positiveExhausted ?? false,
            negativeExhausted: snapshot.negativeExhausted ?? false,
            isStreaming: snapshot.isStreaming ?? false,
            firstHalfNegRatio: temporalData.firstHalfNegRatio,
            secondHalfNegRatio: temporalData.secondHalfNegRatio,
            temporalDriftZ,
            isEndDead,
            hasRevival: revivalData.hasRevival,
            firstWaveNegRatio: revivalData.firstWaveNegRatio,
            lastWaveNegRatio: revivalData.lastWaveNegRatio,
            revivalSentimentChange: revivalData.revivalSentimentChange,
            isStillAlive: revivalData.isStillAlive,
            negativeSpikes: windowNegativeSpikes,
            positiveSpikes: windowPositiveSpikes,
            negativeBombVolumeZ: windowNegativeSpikes[0]?.volumeZ || 0,
            negativeBombSentimentZ: windowNegativeSpikes[0]?.sentimentZ || 0,
            negativeBombMonth: windowNegativeSpikes[0]?.month || null,
            negativeBombMultiple: windowNegativeSpikes[0]?.multiple || 0,
            negativeBombCount: windowNegativeSpikes[0]?.count || 0,
            negativeBombIsVolume: windowNegativeSpikes[0]?.isVolumeSpike || false,
            negativeBombIsSentiment: windowNegativeSpikes[0]?.isSentimentSpike || false,
            positiveBombVolumeZ: windowPositiveSpikes[0]?.volumeZ || 0,
            positiveBombSentimentZ: windowPositiveSpikes[0]?.sentimentZ || 0,
            positiveBombMonth: windowPositiveSpikes[0]?.month || null,
            positiveBombMultiple: windowPositiveSpikes[0]?.multiple || 0,
            positiveBombCount: windowPositiveSpikes[0]?.count || 0,
            positiveBombIsVolume: windowPositiveSpikes[0]?.isVolumeSpike || false,
            positiveBombIsSentiment: windowPositiveSpikes[0]?.isSentimentSpike || false,
            excludedMonths: excludeMonths,
            recentNegativeEditRatio: editAnalysis.recentNegativeEditRatio,
            oldReviewsEditedRatio: editAnalysis.oldReviewsEditedRatio,
            totalEdits: editAnalysis.totalEdits
        };

        const verdict = this.deriveVerdict(metricsBundle);
        return { ...metricsBundle, verdict };
    },

    /**
     * Project sampled counts to full distribution
     * Assumes even temporal distribution, adjusts as data streams in
     */
    projectCounts(buckets, filter, snapshot) {
        const sampled = this.computeSampledCounts(buckets, filter);
        
        const gameTotalPos = snapshot.gameTotalPositive || 1;
        const gameTotalNeg = snapshot.gameTotalNegative || 1;
        const sampledPos = snapshot.totalPositive || 1;
        const sampledNeg = snapshot.totalNegative || 1;
        
        const posMultiplier = gameTotalPos / sampledPos;
        const negMultiplier = gameTotalNeg / sampledNeg;
        
        return {
            positive: sampled.positive * posMultiplier,
            negative: sampled.negative * negMultiplier,
            uncertainPositive: sampled.uncertainPositive * posMultiplier,
            uncertainNegative: sampled.uncertainNegative * negMultiplier,
            certain: (sampled.positive + sampled.negative) * ((posMultiplier + negMultiplier) / 2),
            uncertain: (sampled.uncertainPositive + sampled.uncertainNegative) * ((posMultiplier + negMultiplier) / 2),
            total: sampled.positive * posMultiplier + sampled.negative * negMultiplier + 
                   sampled.uncertainPositive * posMultiplier + sampled.uncertainNegative * negMultiplier,
            // Keep raw sampled for reference
            sampledPositive: sampled.positive,
            sampledNegative: sampled.negative,
            sampledUncertainPositive: sampled.uncertainPositive,
            sampledUncertainNegative: sampled.uncertainNegative,
            sampledTotal: sampled.total
        };
    },

    /**
     * Project a single bucket's counts to full distribution
     * Returns both sampled and projected counts
     */
    projectBucket(bucket, filter, snapshot) {
        const f = this.filterBucket(bucket, filter);
        
        const gameTotalPos = snapshot.gameTotalPositive || 1;
        const gameTotalNeg = snapshot.gameTotalNegative || 1;
        const sampledPos = snapshot.totalPositive || 1;
        const sampledNeg = snapshot.totalNegative || 1;
        
        const posMultiplier = gameTotalPos / sampledPos;
        const negMultiplier = gameTotalNeg / sampledNeg;
        
        return {
            // Sampled (solid bars)
            sampledPos: f.pos,
            sampledNeg: f.neg,
            sampledUncPos: f.uncPos,
            sampledUncNeg: f.uncNeg,
            // Projected (additional ghost bars)
            projectedPos: f.pos * (posMultiplier - 1),
            projectedNeg: f.neg * (negMultiplier - 1),
            projectedUncPos: f.uncPos * (posMultiplier - 1),
            projectedUncNeg: f.uncNeg * (negMultiplier - 1),
            // Totals
            totalPos: f.pos * posMultiplier,
            totalNeg: f.neg * negMultiplier,
            totalUncPos: f.uncPos * posMultiplier,
            totalUncNeg: f.uncNeg * negMultiplier
        };
    },

    /**
     * Get sampled counts (not projected)
     */
    computeSampledCounts(buckets, filter = null) {
        let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;

        for (const bucket of buckets) {
            const filtered = this.filterBucket(bucket, filter);
            pos += filtered.pos;
            neg += filtered.neg;
            uncPos += filtered.uncPos;
            uncNeg += filtered.uncNeg;
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

    getPlaytimeArray(buckets, type, filter) {
        const values = [];
        for (const bucket of buckets) {
            const f = this.filterBucket(bucket, filter);
            const midpoint = (bucket.minPlaytime + bucket.maxPlaytime) / 2;
            const count = type === 'positive' ? f.pos + f.uncPos : f.neg + f.uncNeg;
            for (let i = 0; i < count; i++) values.push(midpoint);
        }
        return values;
    },

    /**
     * Get predicted monthly data with position-based extrapolation.
     * This corrects for Steam's recency bias in the cursor.
     * 
     * Older months are undersampled (cursor is frontloaded toward recent).
     * We extrapolate older months more aggressively to reconstruct the true timeline.
     * 
     * @param {Array} buckets - The bucket data
     * @param {Object} filter - Optional time filter
     * @param {Object} snapshot - Snapshot with game totals
     * @returns {Array} Array of { month, pos, neg, total, projectedPos, projectedNeg, projectedTotal }
     */
    getPredictedMonthlyData(buckets, filter, snapshot) {
        // Collect all months
        const allMonths = new Set();
        for (const bucket of buckets) {
            for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.uncertainPositiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.uncertainNegativeByMonth || {})) allMonths.add(month);
        }
        
        let sortedMonths = [...allMonths].sort();
        
        // Apply filter
        if (filter) {
            sortedMonths = sortedMonths.filter(m => {
                if (filter.from && m < filter.from) return false;
                if (filter.to && m > filter.to) return false;
                if (filter.excludeMonths && filter.excludeMonths.includes(m)) return false;
                return true;
            });
        }
        
        if (sortedMonths.length === 0) return [];
        
        // Build raw sampled data per month
        const monthData = [];
        let totalSampled = 0;
        
        for (const month of sortedMonths) {
            let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;
            for (const bucket of buckets) {
                pos += bucket.positiveByMonth?.[month] || 0;
                neg += bucket.negativeByMonth?.[month] || 0;
                uncPos += bucket.uncertainPositiveByMonth?.[month] || 0;
                uncNeg += bucket.uncertainNegativeByMonth?.[month] || 0;
            }
            const sampledPos = pos + uncPos;
            const sampledNeg = neg + uncNeg;
            const sampledTotal = sampledPos + sampledNeg;
            totalSampled += sampledTotal;
            monthData.push({ month, pos, neg, uncPos, uncNeg, sampledPos, sampledNeg, sampledTotal });
        }
        
        if (totalSampled === 0) return monthData;
        
        // Game totals from Steam (ground truth)
        const gameTotalPos = snapshot.gameTotalPositive || 0;
        const gameTotalNeg = snapshot.gameTotalNegative || 0;
        const gameTotal = gameTotalPos + gameTotalNeg;
        const trueRatio = gameTotal > 0 ? gameTotalPos / gameTotal : 0.5;
        
        if (gameTotal === 0) return monthData;
        
        // Sample rate
        const sampleRate = totalSampled / gameTotal;
        
        // Position-based extrapolation:
        // Recent months (position close to end) are oversampled - less extrapolation needed
        // Old months (position close to start) are undersampled - more extrapolation needed
        const n = monthData.length;
        for (let i = 0; i < n; i++) {
            const m = monthData[i];
            
            // Position 0 = oldest, position n-1 = newest
            const positionRatio = i / Math.max(1, n - 1); // 0 (oldest) to 1 (newest)
            
            // For newest months (positionRatio=1): multiplier → 1 (no extrapolation)
            // For oldest months (positionRatio=0): multiplier → 1/sampleRate (full extrapolation)
            const maxMultiplier = sampleRate > 0 ? 1 / sampleRate : 1;
            const multiplier = Math.pow(maxMultiplier, 1 - positionRatio);
            
            m.estimatedTrue = m.sampledTotal * multiplier;
        }
        
        // Normalize so estimates sum to gameTotal
        const estimateSum = monthData.reduce((sum, m) => sum + m.estimatedTrue, 0);
        const normalizeFactor = estimateSum > 0 ? gameTotal / estimateSum : 1;
        
        for (const m of monthData) {
            m.projectedTotal = m.estimatedTrue * normalizeFactor;
            
            // Spike-aware projection:
            // If this month is more negative than baseline, only project the negatives
            // If this month is more positive than baseline, only project the positives
            const localRatio = m.sampledTotal > 0 ? m.sampledPos / m.sampledTotal : trueRatio;
            const ratioDiff = localRatio - trueRatio;
            
            if (ratioDiff >= 0) {
                // More positive than usual - project positives, negatives stay sampled
                m.projectedNeg = m.sampledNeg;
                m.projectedPos = Math.max(m.sampledPos, m.projectedTotal - m.projectedNeg);
            } else {
                // More negative than usual - project negatives, positives stay sampled
                m.projectedPos = m.sampledPos;
                m.projectedNeg = Math.max(m.sampledNeg, m.projectedTotal - m.projectedPos);
            }
            
            // Final totals
            m.total = m.projectedTotal;
            m.pos = m.projectedPos;
            m.neg = m.projectedNeg;
        }
        
        return monthData;
    },

    computeStats(values) {
        if (values.length === 0) return { mean: 0, median: 0, stddev: 0, p95: 0 };
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

    detectBimodality(buckets, filter) {
        const earlyThreshold = 20 * 60;
        const lateThreshold = 100 * 60;
        const minClusterRatio = 0.15;
        
        let earlyCount = 0, lateCount = 0, totalNeg = 0;
        
        for (const bucket of buckets) {
            const filtered = this.filterBucket(bucket, filter);
            const neg = filtered.neg + filtered.uncNeg;
            totalNeg += neg;
            const midpoint = (bucket.minPlaytime + bucket.maxPlaytime) / 2;
            if (midpoint < earlyThreshold) earlyCount += neg;
            else if (midpoint > lateThreshold) lateCount += neg;
        }
        
        if (totalNeg < 50) return { isBimodal: false, earlyRatio: 0, lateRatio: 0, totalNeg };
        
        const earlyRatio = earlyCount / totalNeg;
        const lateRatio = lateCount / totalNeg;
        const isBimodal = earlyRatio >= minClusterRatio && lateRatio >= minClusterRatio;
        
        return { isBimodal, earlyRatio, lateRatio, earlyCount, lateCount, totalNeg };
    },

    computeTemporalDrift(buckets, filter, snapshot) {
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
        
        if (sortedMonths.length < 6) return { firstHalfNegRatio: 0, secondHalfNegRatio: 0, stddev: 0 };

        const monthlyRatios = [];
        for (const month of sortedMonths) {
            let pos = 0, neg = 0;
            for (const bucket of buckets) {
                pos += (bucket.positiveByMonth?.[month] || 0) + (bucket.uncertainPositiveByMonth?.[month] || 0);
                neg += (bucket.negativeByMonth?.[month] || 0) + (bucket.uncertainNegativeByMonth?.[month] || 0);
            }
            if (pos + neg > 0) monthlyRatios.push(neg / (pos + neg));
        }
        
        const recentMonths = 12;
        const cutoff = Math.max(0, sortedMonths.length - recentMonths);
        const earlierPeriod = { from: sortedMonths[0], to: sortedMonths[cutoff - 1] || sortedMonths[0], excludeMonths: filter?.excludeMonths };
        const recentPeriod = { from: sortedMonths[cutoff], to: sortedMonths[sortedMonths.length - 1], excludeMonths: filter?.excludeMonths };

        const earlierCounts = this.projectCounts(buckets, earlierPeriod, snapshot);
        const recentCounts = this.projectCounts(buckets, recentPeriod, snapshot);
        
        const firstHalfNegRatio = earlierCounts.total > 0 
            ? (earlierCounts.negative + earlierCounts.uncertainNegative) / earlierCounts.total : 0;
        const secondHalfNegRatio = recentCounts.total > 0 
            ? (recentCounts.negative + recentCounts.uncertainNegative) / recentCounts.total : 0;
        
        const ratioStats = this.computeStats(monthlyRatios);
        return { firstHalfNegRatio, secondHalfNegRatio, stddev: ratioStats.stddev || 0.1 };
    },

    getMonthlyActivityData(buckets, filter = null, snapshot = null) {
        // Use predicted data if snapshot available
        if (snapshot) {
            const monthlyData = this.getPredictedMonthlyData(buckets, filter, snapshot);
            if (monthlyData.length === 0) return { months: [], activity: [], p25: 0, p75: 0 };
            
            const activity = monthlyData.map(m => ({
                month: m.month,
                pos: m.pos,
                neg: m.neg,
                count: m.total
            }));
            
            const sortedByCount = [...activity].sort((a, b) => a.count - b.count);
            const p10 = sortedByCount[Math.floor(sortedByCount.length * 0.10)]?.count || 0;
            const p25 = sortedByCount[Math.floor(sortedByCount.length * 0.25)]?.count || 0;
            const p75 = sortedByCount[Math.floor(sortedByCount.length * 0.75)]?.count || 0;
            
            return { months: monthlyData.map(m => m.month), activity, p10, p25, p75 };
        }
        
        // Fallback to raw data
        const allMonths = new Set();
        for (const bucket of buckets) {
            for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.uncertainPositiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.uncertainNegativeByMonth || {})) allMonths.add(month);
        }
        
        let sortedMonths = [...allMonths].sort();
        if (filter && filter.from) sortedMonths = sortedMonths.filter(m => m >= filter.from && m <= filter.to);
        
        const activity = sortedMonths.map(month => {
            let pos = 0, neg = 0;
            for (const bucket of buckets) {
                pos += (bucket.positiveByMonth?.[month] || 0) + (bucket.uncertainPositiveByMonth?.[month] || 0);
                neg += (bucket.negativeByMonth?.[month] || 0) + (bucket.uncertainNegativeByMonth?.[month] || 0);
            }
            return { month, pos, neg, count: pos + neg };
        });
        
        if (activity.length === 0) return { months: [], activity: [], p25: 0, p75: 0 };
        
        const sortedByCount = [...activity].sort((a, b) => a.count - b.count);
        const p10 = sortedByCount[Math.floor(sortedByCount.length * 0.10)]?.count || 0;
        const p25 = sortedByCount[Math.floor(sortedByCount.length * 0.25)]?.count || 0;
        const p75 = sortedByCount[Math.floor(sortedByCount.length * 0.75)]?.count || 0;
        
        return { months: sortedMonths, activity, p10, p25, p75 };
    },

    computeWindowEndActivity(buckets, filter, snapshot = null) {
        const windowData = this.getMonthlyActivityData(buckets, filter, snapshot);
        if (windowData.activity.length < 6) return { endActivity: 1, startActivity: 1, isInBottomQuartile: false };
        
        const activity = windowData.activity;
        const firstHalfCount = Math.floor(activity.length / 2);
        const firstHalf = activity.slice(0, firstHalfCount);
        const startActivity = firstHalf.reduce((sum, m) => sum + m.count, 0) / firstHalf.length;
        const endMonths = activity.slice(-3);
        const endActivity = endMonths.reduce((sum, m) => sum + m.count, 0) / endMonths.length;
        const isInBottomQuartile = startActivity > 0 && endActivity < startActivity * 0.2;
        
        return { endActivity, startActivity, isInBottomQuartile };
    },

    detectRevival(buckets, filter, snapshot = null) {
        const windowData = this.getMonthlyActivityData(buckets, filter, snapshot);
        if (windowData.activity.length < 6) return { hasRevival: false };
        
        const activity = windowData.activity;
        let hasRevival = false;
        let firstWaveData = { pos: 0, neg: 0 };
        let lastWaveData = { pos: 0, neg: 0 };
        let deathStartIdx = -1;
        
        const getAvg = (start, end) => {
            const slice = activity.slice(start, end);
            return slice.length > 0 ? slice.reduce((sum, m) => sum + m.count, 0) / slice.length : 0;
        };
        
        for (let i = 6; i < activity.length - 3; i++) {
            const priorAvg = getAvg(i - 6, i);
            const currentAvg = getAvg(i, i + 3);
            
            if (priorAvg > 0 && currentAvg < priorAvg * 0.2) {
                for (let j = i + 3; j < activity.length - 2; j++) {
                    const revivalAvg = getAvg(j, j + 3);
                    if (revivalAvg >= priorAvg * 0.5) {
                        hasRevival = true;
                        deathStartIdx = i;
                        for (let k = 0; k < i; k++) {
                            firstWaveData.pos += activity[k].pos;
                            firstWaveData.neg += activity[k].neg;
                        }
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
        
        if (!hasRevival) return { hasRevival: false };
        
        const firstWaveNegRatio = firstWaveData.neg / Math.max(1, firstWaveData.pos + firstWaveData.neg);
        const lastWaveNegRatio = lastWaveData.neg / Math.max(1, lastWaveData.pos + lastWaveData.neg);
        
        const postRevivalStart = deathStartIdx + 6;
        const postRevivalActivity = activity.slice(postRevivalStart);
        if (postRevivalActivity.length < 6) {
            return { hasRevival: true, firstWaveNegRatio, lastWaveNegRatio, revivalSentimentChange: lastWaveNegRatio - firstWaveNegRatio, isStillAlive: true };
        }
        
        const firstHalf = postRevivalActivity.slice(0, Math.floor(postRevivalActivity.length / 2));
        const startActivity = firstHalf.reduce((sum, m) => sum + m.count, 0) / firstHalf.length;
        const endMonths = activity.slice(-3);
        const endActivity = endMonths.reduce((sum, m) => sum + m.count, 0) / endMonths.length;
        const isStillAlive = startActivity === 0 || endActivity >= startActivity * 0.2;
        
        return { hasRevival: true, firstWaveNegRatio, lastWaveNegRatio, revivalSentimentChange: lastWaveNegRatio - firstWaveNegRatio, isStillAlive };
    },

    detectSpikes(buckets, filter, snapshot = null) {
        // Use predicted data if snapshot available, otherwise fall back to raw
        let monthlyData;
        if (snapshot) {
            monthlyData = this.getPredictedMonthlyData(buckets, filter, snapshot);
        } else {
            // Fallback to raw data (backwards compatibility)
            const allMonths = new Set();
            for (const bucket of buckets) {
                for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
                for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
            }
            
            let sortedMonths = [...allMonths].sort();
            if (filter) sortedMonths = sortedMonths.filter(m => m >= filter.from && m <= filter.to);
            
            monthlyData = [];
            for (const month of sortedMonths) {
                let pos = 0, neg = 0;
                for (const bucket of buckets) {
                    pos += (bucket.positiveByMonth?.[month] || 0) + (bucket.uncertainPositiveByMonth?.[month] || 0);
                    neg += (bucket.negativeByMonth?.[month] || 0) + (bucket.uncertainNegativeByMonth?.[month] || 0);
                }
                monthlyData.push({ month, pos, neg, total: pos + neg });
            }
        }
        
        // Compute baseline sentiment ratio across ALL months
        const totalPos = monthlyData.reduce((sum, m) => sum + m.pos, 0);
        const totalNeg = monthlyData.reduce((sum, m) => sum + m.neg, 0);
        const baselineNegRatio = (totalPos + totalNeg) > 0 ? totalNeg / (totalPos + totalNeg) : 0.5;
        
        // Compute per-month neg ratios for sentiment stddev
        const monthlyNegRatios = monthlyData
            .filter(m => m.total >= 10) // need minimum data for meaningful ratio
            .map(m => m.neg / m.total);
        const sentimentStats = this.computeStats(monthlyNegRatios);
        
        const windowSize = 3;
        const volumeThreshold = 2.5;
        const sentimentThreshold = 2.0;
        
        const allSpikes = [];
        
        for (let i = 0; i < monthlyData.length; i++) {
            const m = monthlyData[i];
            if (m.total < 10) continue; // skip months with too little data
            
            // === VOLUME Z-SCORE (existing logic) ===
            const neighbors = [];
            for (let j = Math.max(0, i - windowSize); j <= Math.min(monthlyData.length - 1, i + windowSize); j++) {
                if (j !== i) neighbors.push(monthlyData[j].total);
            }
            
            let volumeZ = 0;
            let volumeMultiple = 1;
            if (neighbors.length >= 2) {
                const localStats = this.computeStats(neighbors);
                if (localStats.stddev > 0) {
                    volumeZ = (m.total - localStats.mean) / localStats.stddev;
                    volumeMultiple = localStats.mean > 0 ? m.total / localStats.mean : m.total;
                }
            }
            
            // === SENTIMENT Z-SCORE (new) ===
            const negRatio = m.neg / m.total;
            let sentimentZ = 0;
            if (sentimentStats.stddev > 0) {
                // Positive sentimentZ = more negative than baseline
                // Negative sentimentZ = more positive than baseline  
                sentimentZ = (negRatio - baselineNegRatio) / sentimentStats.stddev;
            }
            
            // Launch dampening - don't flag early months as anomalies
            const launchWeight = 1 - Math.exp(-i / 6);
            const effectiveVolumeZ = volumeZ * launchWeight;
            const effectiveSentimentZ = sentimentZ * launchWeight;
            
            const isVolumeSpike = effectiveVolumeZ >= volumeThreshold;
            const isSentimentSpike = Math.abs(effectiveSentimentZ) >= sentimentThreshold;
            
            if (isVolumeSpike || isSentimentSpike) {
                // Determine if this is a negative or positive spike
                // - If sentiment spiked negative (sentimentZ > 0), it's negative
                // - If sentiment spiked positive (sentimentZ < 0), it's positive  
                // - If only volume spiked, use the ratio vs baseline
                let isNegative;
                if (isSentimentSpike) {
                    isNegative = effectiveSentimentZ > 0;
                } else {
                    isNegative = negRatio > baselineNegRatio;
                }
                
                allSpikes.push({
                    month: m.month,
                    volumeZ: effectiveVolumeZ,
                    sentimentZ: effectiveSentimentZ,
                    rawVolumeZ: volumeZ,
                    rawSentimentZ: sentimentZ,
                    isVolumeSpike,
                    isSentimentSpike,
                    multiple: volumeMultiple,
                    count: m.total,
                    negCount: m.neg,
                    posCount: m.pos,
                    negRatio,
                    baselineNegRatio,
                    isNegative,
                    launchWeight
                });
            }
        }
        
        // Sort by combined magnitude (volume + sentiment)
        allSpikes.sort((a, b) => {
            const aMag = Math.max(a.volumeZ, Math.abs(a.sentimentZ));
            const bMag = Math.max(b.volumeZ, Math.abs(b.sentimentZ));
            return bMag - aMag;
        });
        
        // Split into negative and positive for backwards compatibility
        const negativeSpikes = allSpikes.filter(s => s.isNegative);
        const positiveSpikes = allSpikes.filter(s => !s.isNegative);
        
        return { negativeSpikes, positiveSpikes, allSpikes };
    },

    deriveVerdict(m) {
        let tags = [];
        let totalSeverity = 0;

        for (const def of this.tagDefinitions) {
            try {
                if (def.condition(m)) {
                    const severity = typeof def.severity === 'function' ? def.severity(m) : def.severity;
                    const reason = typeof def.reason === 'function' ? def.reason(m) : def.reason;
                    tags.push({ id: def.id, severity, reason, color: def.color });
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

        return { tags, primaryTag, severity: normalizedSeverity, rawSeverity: totalSeverity, reasons: tags.map(t => t.reason) };
    },

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

    computeConfidence(sampleSize) {
        if (sampleSize < 100) return 0.1;
        if (sampleSize < 500) return 0.3;
        if (sampleSize < 1000) return 0.5;
        if (sampleSize < 5000) return 0.7;
        if (sampleSize < 10000) return 0.85;
        return 1.0;
    },

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
    
    monthInRange(month, filter) {
        if (!filter || (!filter.from && !filter.to)) return true;
        if (filter.from && month < filter.from) return false;
        if (filter.to && month > filter.to) return false;
        return true;
    },

    analyzeEditHeatmap(editHeatmap) {
        if (!editHeatmap || !editHeatmap.months || editHeatmap.months.length < 6) {
            return { recentNegativeEditRatio: 0, oldReviewsEditedRatio: 0, totalEdits: 0 };
        }
        
        const months = editHeatmap.months;
        const cells = editHeatmap.cells || {};
        const n = months.length;
        
        const recentEditMonths = new Set(months.slice(-6));
        const oldPostMonths = new Set(months.slice(0, Math.floor(n / 2)));
        
        let totalEdits = 0, recentEdits = 0, recentNegativeEdits = 0, oldReviewsEdited = 0, totalOldReviews = 0;
        
        for (const [key, cell] of Object.entries(cells)) {
            const [postedMonth, editedMonth] = key.split('|');
            const count = cell.positive + cell.negative;
            if (postedMonth === editedMonth) continue;
            
            totalEdits += count;
            if (recentEditMonths.has(editedMonth)) {
                recentEdits += count;
                recentNegativeEdits += cell.negative;
            }
            if (oldPostMonths.has(postedMonth) && editedMonth > postedMonth) oldReviewsEdited += count;
        }
        
        for (const [key, cell] of Object.entries(cells)) {
            const [postedMonth] = key.split('|');
            if (oldPostMonths.has(postedMonth)) totalOldReviews += cell.positive + cell.negative;
        }
        
        return {
            recentNegativeEditRatio: recentEdits > 0 ? recentNegativeEdits / recentEdits : 0,
            oldReviewsEditedRatio: totalOldReviews > 0 ? oldReviewsEdited / totalOldReviews : 0,
            totalEdits
        };
    },

    computeTimeline(snapshot, windowMonths = 3, options = {}) {
        const buckets = snapshot.bucketsByReviewTime;
        
        const allMonths = new Set();
        for (const bucket of buckets) {
            for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
            for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
        }
        const sortedMonths = [...allMonths].sort();
        
        if (sortedMonths.length < windowMonths) return [];
        
        const timeline = [];
        
        for (let i = 0; i <= sortedMonths.length - windowMonths; i++) {
            const windowStart = sortedMonths[i];
            const windowEnd = sortedMonths[i + windowMonths - 1];
            const filter = { from: windowStart, to: windowEnd };
            
            const metrics = this.compute(snapshot, { 
                timelineFilter: filter, 
                isFree: options.isFree, 
                isSexual: options.isSexual
            });
            
            timeline.push({
                month: windowEnd,
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
