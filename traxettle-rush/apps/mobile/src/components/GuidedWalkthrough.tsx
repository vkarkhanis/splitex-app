import React, { useMemo } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radii, spacing, fontSizes } from '../theme';

type WalkthroughStep = {
  label?: string;
  title: string;
  body: string;
};

type TargetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
} | null;

type GuidedWalkthroughProps = {
  visible: boolean;
  stepIndex: number;
  steps: WalkthroughStep[];
  targetRect: TargetRect;
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    primary: string;
    black: string;
    white: string;
  };
  onClose: () => void;
  onNext: () => void;
  onBack: () => void;
};

export default function GuidedWalkthrough({
  visible,
  stepIndex,
  steps,
  targetRect,
  colors,
  onClose,
  onNext,
  onBack,
}: GuidedWalkthroughProps) {
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const screen = Dimensions.get('window');
  const layout = useMemo(() => {
    const horizontalPadding = spacing.xl;
    const cardWidth = Math.min(screen.width - horizontalPadding * 2, 360);

    if (!targetRect) {
      return {
        cardTop: Math.max(72, screen.height * 0.18),
        cardLeft: horizontalPadding,
        cardWidth,
        renderAbove: false,
        anchorX: screen.width / 2,
      };
    }

    const cardTop = targetRect.y + targetRect.height + 22;
    const shouldRenderAbove = cardTop > screen.height - 290;
    const targetCenterX = targetRect.x + targetRect.width / 2;
    const preferredLeft = targetCenterX - cardWidth / 2;
    const cardLeft = Math.min(
      Math.max(horizontalPadding, preferredLeft),
      Math.max(horizontalPadding, screen.width - horizontalPadding - cardWidth),
    );
    const anchoredTop = shouldRenderAbove ? Math.max(54, targetRect.y - 248) : cardTop;

    return {
      cardTop: anchoredTop,
      cardLeft,
      cardWidth,
      renderAbove: shouldRenderAbove,
      anchorX: Math.min(Math.max(targetCenterX, cardLeft + 28), cardLeft + cardWidth - 28),
    };
  }, [screen.height, screen.width, targetRect]);

  return (
    <Modal
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {targetRect ? (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.glow,
                {
                  left: targetRect.x - 20,
                  top: targetRect.y - 20,
                  width: targetRect.width + 40,
                  height: targetRect.height + 40,
                  backgroundColor: colors.primary + '22',
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.highlightOuter,
                {
                  left: targetRect.x - 10,
                  top: targetRect.y - 10,
                  width: targetRect.width + 20,
                  height: targetRect.height + 20,
                  borderColor: colors.white + '88',
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.highlight,
                {
                  left: targetRect.x - 4,
                  top: targetRect.y - 4,
                  width: targetRect.width + 8,
                  height: targetRect.height + 8,
                  borderColor: colors.primary,
                  shadowColor: colors.black,
                },
              ]}
            />
            {step.label ? (
              <View
                pointerEvents="none"
                style={[
                  styles.targetLabel,
                  {
                    left: Math.min(
                      Math.max(spacing.lg, targetRect.x),
                      Math.max(spacing.lg, screen.width - spacing.lg - 140),
                    ),
                    top: Math.max(18, targetRect.y - 34),
                    backgroundColor: colors.black + 'CC',
                  },
                ]}
              >
                <Text style={[styles.targetLabelText, { color: colors.white }]}>{step.label}</Text>
              </View>
            ) : null}
          </>
        ) : null}

        <View
          style={[
            styles.cardWrap,
            {
              top: layout.cardTop,
              left: layout.cardLeft,
              width: layout.cardWidth,
            },
          ]}
        >
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                shadowColor: colors.black,
              },
            ]}
          >
            {targetRect ? (
              <View
                style={[
                  styles.pointer,
                  layout.renderAbove
                    ? {
                        bottom: -12,
                        top: undefined,
                        borderTopColor: colors.surface,
                        borderBottomWidth: 0,
                        borderTopWidth: 12,
                      }
                    : {
                        top: -12,
                        bottom: undefined,
                        borderBottomColor: colors.surface,
                        borderTopWidth: 0,
                        borderBottomWidth: 12,
                      },
                  {
                    left: layout.anchorX - layout.cardLeft - 10,
                  },
                ]}
              />
            ) : null}
            <View style={styles.cardHeader}>
              <Text style={[styles.stepPill, { color: colors.primary, backgroundColor: colors.primary + '14' }]}>
                Step {stepIndex + 1} of {steps.length}
              </Text>
              <View style={styles.dots}>
                {steps.map((_, index) => (
                  <View
                    key={`walkthrough-dot-${index}`}
                    style={[
                      styles.dot,
                      { backgroundColor: index === stepIndex ? colors.primary : colors.border },
                    ]}
                  />
                ))}
              </View>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{step.title}</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>{step.body}</Text>
            {targetRect ? (
              <View style={styles.tipRow}>
                <View style={[styles.tipAccent, { backgroundColor: colors.primary }]} />
                <Text style={[styles.tipText, { color: colors.textSecondary }]}>
                  {layout.renderAbove ? 'Look just above this card for the highlighted action.' : 'The highlighted action is directly above this note.'}
                </Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable onPress={onClose} style={styles.secondaryAction}>
                <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>Skip</Text>
              </Pressable>

              <View style={styles.trailingActions}>
                {stepIndex > 0 ? (
                  <Pressable onPress={onBack} style={styles.secondaryAction}>
                    <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>Back</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={onNext}
                  style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.primaryText, { color: colors.white }]}>
                    {isLast ? 'Finish' : 'Next'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(12, 18, 28, 0.68)',
  },
  glow: {
    position: 'absolute',
    borderRadius: radii.xl,
  },
  highlightOuter: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: radii.xl,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  highlight: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.02)',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  cardWrap: {
    position: 'absolute',
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
  },
  pointer: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  stepPill: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    borderRadius: radii.full,
    overflow: 'hidden',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radii.full,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  tipRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148, 163, 184, 0.32)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tipAccent: {
    width: 6,
    height: 26,
    borderRadius: radii.full,
  },
  tipText: {
    flex: 1,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    fontWeight: '500',
  },
  actions: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trailingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  secondaryAction: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  secondaryText: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  primaryAction: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
  },
  primaryText: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
  },
  targetLabel: {
    position: 'absolute',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.full,
    maxWidth: 140,
  },
  targetLabelText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
