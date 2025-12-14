/**
 * Metrics module for gamersremorse
 * Pure analysis functions - no UI, no side effects
 * 
 * Core principle: all metrics weighted by mass, continuous severity
 */

const Metrics = {
    /**
     * Compute all metrics from a snapshot
     */
    compute(snapshot, options = {}) {
        const buckets = snapshot.bucketsByReviewTime;
        const totalBuckets = snapshot.bucketsByTotalTime;
        const filter = options.timelineFilter || null;
        const isFree = options.isFree || false;

        // Review counts
        const counts = this.computeCounts(buckets, filter);
        const total = Math.max(1, counts.total);
        
        // Mass ratios - the foundation everything else builds on
        const positiveRatio = (counts.positive + counts.uncertainPositive) / total;
        const negativeRatio = (counts.negative + counts.uncertainNegative) / total;

        // Core medians
        const posMedianReview = this.computeMedian(buckets, 'positive', filter);
        const negMedianReview = this.computeMedian(buckets, 'negative', filter);
        const posMedianTotal = this.computeMedian(totalBuckets, 'positive', filter);
        const negMedianTotal = this.computeMedian(totalBuckets, 'negative', filter);

        // Raw ratios
        const medianRatio = posMedianReview > 0 ? negMedianReview / posMedianReview : 1;
        const stockholmIndex = negMedianReview > 0 ? negMedianTotal / negMedianReview : 1;
        const refundHonesty = isFree ? null : this.computeRefundHonesty(buckets, filter);

        // WEIGHTED metrics - normalized by mass
        const weightedMedianDelta = (medianRatio - 1) * negativeRatio;
        const weightedStockholm = (stockholmIndex - 1) * negativeRatio;
        const weightedRefund = refundHonesty !== null 
            ? (0.5 - refundHonesty) * negativeRatio  // 0.5 is "neutral", below = bad
            : 0;
        
        // Confidence based on sample size
        const confidence = this.computeConfidence(counts.total);
        const anomalyDensity = snapshot.anomalyIndices.length / buckets.length;

        // Bundle for verdict
        const metricsBundle = {
            counts,
            total,
            positiveRatio,
            negativeRatio,
            posMedianReview,
            negMedianReview,
            medianRatio,
            stockholmIndex,
            refundHonesty,
            weightedMedianDelta,
            weightedStockholm,
            weightedRefund,
            confidence,
            anomalyDensity,
            isFree
        };

        // Derive verdict
        const verdict = this.deriveVerdict(metricsBundle);

        return {
            ...metricsBundle,
            verdict
        };
    },

    /**
     * Continuous severity calculation - no binary thresholds
     * Each factor contributes proportionally to its magnitude
     */
    deriveVerdict(m) {
        // Check for data quality issues first
        if (m.confidence < 0.3) {
            return {
                category: 'insufficient',
                severity: 0,
                reasons: ['Limited sample size - verdict uncertain'],
                rawSeverity: 0
            };
        }
        
        if (m.anomalyDensity > 0.2) {
            return {
                category: 'corrupted',
                severity: 0,
                reasons: ['High anomaly density - possible review manipulation'],
                rawSeverity: 0
            };
        }

        // === CONTINUOUS SEVERITY CALCULATION ===
        // Positive factors (reduce severity)
        // Scale from 0.5 baseline - being 50% positive is neutral
        const positiveBonus = -0.5 * Math.max(0, m.positiveRatio - 0.5);
        
        // Early negative exit bonus (medianRatio < 1 means negatives leave early)
        const earlyExitBonus = m.medianRatio < 1 
            ? -0.3 * (1 - m.medianRatio) * m.negativeRatio 
            : 0;

        // Negative factors (increase severity)
        // Late negative reviews - weighted by mass
        const lateNegativePenalty = Math.max(0, m.weightedMedianDelta) * 0.8;
        
        // Stockholm - weighted by mass
        const stockholmPenalty = Math.max(0, m.weightedStockholm) * 0.5;
        
        // Refund trap - weighted by mass (only for paid games)
        const refundPenalty = Math.max(0, m.weightedRefund) * 0.4;
        
        // High negative ratio penalty (kicks in above 30%)
        const negativeRatioPenalty = Math.max(0, m.negativeRatio - 0.3) * 0.5;

        // Sum it all up
        const rawSeverity = 
            positiveBonus +
            earlyExitBonus +
            lateNegativePenalty +
            stockholmPenalty +
            refundPenalty +
            negativeRatioPenalty;

        // Build reasons based on significant contributors
        const reasons = [];
        
        if (positiveBonus < -0.1) {
            reasons.push(`${Math.round(m.positiveRatio * 100)}% of reviews are positive`);
        }
        if (earlyExitBonus < -0.02) {
            reasons.push('People who dislike it figure that out quickly');
        }
        if (lateNegativePenalty > 0.03) {
            reasons.push(`Negative reviews come at ${m.medianRatio.toFixed(1)}x the playtime of positive`);
        }
        if (stockholmPenalty > 0.03) {
            reasons.push(`Negative reviewers played ${m.stockholmIndex.toFixed(1)}x more after reviewing`);
        }
        if (refundPenalty > 0.02) {
            reasons.push('Few negative reviews in refund window');
        }
        if (negativeRatioPenalty > 0.02) {
            reasons.push(`${Math.round(m.negativeRatio * 100)}% of reviews are negative`);
        }

        // Derive category from continuous severity
        let category;
        if (rawSeverity >= 0.25) {
            category = 'predatory';
        } else if (rawSeverity >= 0.10) {
            category = 'extractive';
        } else if (rawSeverity >= 0.02) {
            category = 'suspicious';
        } else if (rawSeverity <= -0.10) {
            category = 'healthy';
        } else {
            category = 'neutral';
        }

        // Normalize to 0-1 for display (centered around 0.4)
        const normalizedSeverity = Math.max(0, Math.min(1, (rawSeverity + 0.25) / 0.5));

        return {
            category,
            severity: normalizedSeverity,
            reasons,
            rawSeverity,
            // Debug breakdown
            breakdown: {
                positiveBonus,
                earlyExitBonus,
                lateNegativePenalty,
                stockholmPenalty,
                refundPenalty,
                negativeRatioPenalty
            }
        };
    },

    /**
     * Compute median playtime for positive or negative reviews
     */
    computeMedian(buckets, type, filter = null) {
        const values = [];

        for (const bucket of buckets) {
            const filtered = this.filterBucket(bucket, filter);
            const midpoint = (bucket.minPlaytime + bucket.maxPlaytime) / 2;
            const count = type === 'positive'
                ? filtered.pos + filtered.uncPos
                : filtered.neg + filtered.uncNeg;

            for (let i = 0; i < count; i++) {
                values.push(midpoint);
            }
        }

        if (values.length === 0) return 0;
        values.sort((a, b) => a - b);
        return values[Math.floor(values.length / 2)];
    },

    /**
     * Compute total review counts
     */
    computeCounts(buckets, filter = null) {
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

    /**
     * What percentage of negative reviews came before the 2h refund window?
     */
    computeRefundHonesty(buckets, filter = null) {
        let negBeforeRefund = 0;
        let negTotal = 0;

        for (const bucket of buckets) {
            const filtered = this.filterBucket(bucket, filter);
            const neg = filtered.neg + filtered.uncNeg;
            negTotal += neg;

            if (bucket.maxPlaytime <= 120) {
                negBeforeRefund += neg;
            } else if (bucket.minPlaytime < 120) {
                const ratio = (120 - bucket.minPlaytime) / (bucket.maxPlaytime - bucket.minPlaytime);
                negBeforeRefund += neg * ratio;
            }
        }

        return negTotal > 0 ? negBeforeRefund / negTotal : 0.5; // 0.5 = neutral if no negatives
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
     * Filter bucket counts by timeline range
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

        let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;

        for (const [month, count] of Object.entries(bucket.positiveByMonth)) {
            if (month >= filter.from && month <= filter.to) pos += count;
        }
        for (const [month, count] of Object.entries(bucket.negativeByMonth)) {
            if (month >= filter.from && month <= filter.to) neg += count;
        }
        for (const [month, count] of Object.entries(bucket.uncertainPositiveByMonth)) {
            if (month >= filter.from && month <= filter.to) uncPos += count;
        }
        for (const [month, count] of Object.entries(bucket.uncertainNegativeByMonth)) {
            if (month >= filter.from && month <= filter.to) uncNeg += count;
        }

        return { pos, neg, uncPos, uncNeg };
    }
};

window.Metrics = Metrics;
