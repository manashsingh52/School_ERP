import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/theme.dart';

class RadarValue {
  const RadarValue(this.label, this.value, [this.compare]);
  final String label;

  /// 0–100.
  final double? value;

  /// Drawn dashed underneath (the section average).
  final double? compare;
}

String _short(String s, [int n = 10]) =>
    s.length > n ? '${s.substring(0, n - 1).trimRight()}..' : s;

/// Performance radar: one spoke per subject, the child's shape in green over the section's dashed
/// one. Tap a point (or its label) to pick that subject.
class RadarChart extends StatelessWidget {
  const RadarChart({
    super.key,
    required this.values,
    this.selected,
    this.onSelect,
  });
  final List<RadarValue> values;
  final int? selected;
  final ValueChanged<int>? onSelect;

  @override
  Widget build(BuildContext context) {
    final s = StatusColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, box) {
        final side = math.min(box.maxWidth, 380.0);
        final painter = _RadarPainter(
          values: values,
          selected: selected,
          line: s.success,
          ring: s.border,
          compare: s.muted,
          label: scheme.onSurfaceVariant,
          value: scheme.onSurface,
        );
        return Center(
          child: Semantics(
            label:
                'Marks by subject: ${values.map((v) => '${v.label} ${v.value?.round() ?? '—'}%').join(', ')}',
            child: GestureDetector(
              onTapUp: onSelect == null
                  ? null
                  : (d) {
                      final i = painter.hit(d.localPosition, Size.square(side));
                      if (i != null) onSelect!(i);
                    },
              child: CustomPaint(size: Size.square(side), painter: painter),
            ),
          ),
        );
      },
    );
  }
}

class _RadarPainter extends CustomPainter {
  _RadarPainter({
    required this.values,
    required this.selected,
    required this.line,
    required this.ring,
    required this.compare,
    required this.label,
    required this.value,
  });
  final List<RadarValue> values;
  final int? selected;
  final Color line, ring, compare, label, value;

  double _angle(int i) => (-90 + 360 / values.length * i) * math.pi / 180;
  double _radius(Size size) => size.width / 2 - 62;
  Offset _point(Size size, int i, double v) {
    final c = size.center(Offset.zero);
    final r = _radius(size) * (v.clamp(0, 100) / 100);
    return c + Offset(math.cos(_angle(i)) * r, math.sin(_angle(i)) * r);
  }

  /// The subject nearest a tap, if the tap is near a point or a label.
  int? hit(Offset at, Size size) {
    int? best;
    var bestD = 44.0;
    for (var i = 0; i < values.length; i++) {
      for (final target in [
        _point(size, i, values[i].value ?? 0),
        _point(size, i, 128),
      ]) {
        final d = (target - at).distance;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    return best;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final R = _radius(size);
    final ringPaint = Paint()
      ..style = PaintingStyle.stroke
      ..color = ring
      ..strokeWidth = 1;
    for (final f in [0.25, 0.5, 0.75]) {
      canvas.drawCircle(c, R * f, ringPaint);
    }
    canvas.drawCircle(
      c,
      R,
      Paint()
        ..style = PaintingStyle.stroke
        ..color = line.withValues(alpha: 0.45)
        ..strokeWidth = 1.5,
    );
    for (var i = 0; i < values.length; i++) {
      canvas.drawLine(c, _point(size, i, 100), ringPaint);
    }

    Path shape(double? Function(RadarValue) pick) {
      final p = Path();
      for (var i = 0; i < values.length; i++) {
        final pt = _point(size, i, pick(values[i]) ?? 0);
        i == 0 ? p.moveTo(pt.dx, pt.dy) : p.lineTo(pt.dx, pt.dy);
      }
      return p..close();
    }

    if (values.any((v) => v.compare != null)) {
      final path = shape((v) => v.compare);
      final dashed = Path();
      for (final m in path.computeMetrics()) {
        for (var d = 0.0; d < m.length; d += 9) {
          dashed.addPath(
            m.extractPath(d, math.min(d + 5, m.length)),
            Offset.zero,
          );
        }
      }
      canvas.drawPath(
        dashed,
        Paint()
          ..style = PaintingStyle.stroke
          ..color = compare
          ..strokeWidth = 1.4,
      );
    }
    final mine = shape((v) => v.value);
    canvas.drawPath(mine, Paint()..color = line.withValues(alpha: 0.18));
    canvas.drawPath(
      mine,
      Paint()
        ..style = PaintingStyle.stroke
        ..color = line
        ..strokeWidth = 2.5
        ..strokeJoin = StrokeJoin.round,
    );

    for (var i = 0; i < values.length; i++) {
      final v = values[i].value;
      if (v != null) {
        canvas.drawCircle(_point(size, i, v), selected == i ? 7 : 5, Paint()..color = line);
      }
      final a = _angle(i);
      final anchor =
          _point(size, i, 100) + Offset(math.cos(a) * 14, math.sin(a) * 14);
      final tp = TextPainter(
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
        text: TextSpan(
          children: [
            TextSpan(
              text: '${_short(values[i].label)}\n',
              style: TextStyle(
                color: label,
                fontSize: 12.5,
                fontWeight: selected == i ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
            TextSpan(
              text: v == null ? '—' : '${v.round()}%',
              style: TextStyle(
                color: value,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      )..layout(maxWidth: 90);
      final cos = math.cos(a), sin = math.sin(a);
      final dx = cos > 0.3
          ? 0.0
          : cos < -0.3
          ? -tp.width
          : -tp.width / 2;
      final dy = sin > 0.3
          ? 0.0
          : sin < -0.3
          ? -tp.height
          : -tp.height / 2;
      tp.paint(canvas, anchor + Offset(dx, dy));
    }
  }

  @override
  bool shouldRepaint(_RadarPainter old) =>
      old.values != values || old.selected != selected || old.line != line;
}

class ProgressValue {
  const ProgressValue(this.label, this.value, [this.compare]);
  final String label;
  final double value;
  final double? compare;
}

/// Overall % across exams, oldest first, with the section average dashed behind it.
class ProgressLine extends StatelessWidget {
  const ProgressLine({super.key, required this.points});
  final List<ProgressValue> points;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = StatusColors.of(context);
    return Semantics(
      label:
          'Progress: ${points.map((p) => '${p.label} ${p.value.round()}%').join(', ')}',
      child: SizedBox(
        height: 190,
        child: CustomPaint(
          size: Size.infinite,
          painter: _LinePainter(
            points: points,
            line: scheme.primary,
            grid: s.border,
            compare: s.muted,
            text: scheme.onSurface,
            sub: scheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _LinePainter extends CustomPainter {
  _LinePainter({
    required this.points,
    required this.line,
    required this.grid,
    required this.compare,
    required this.text,
    required this.sub,
  });
  final List<ProgressValue> points;
  final Color line, grid, compare, text, sub;

  @override
  void paint(Canvas canvas, Size size) {
    const left = 30.0, right = 12.0, top = 24.0, bottom = 30.0;
    double x(int i) => points.length == 1
        ? size.width / 2
        : left + (size.width - left - right) * i / (points.length - 1);
    double y(double v) =>
        top + (size.height - top - bottom) * (1 - v.clamp(0, 100) / 100);
    final gridPaint = Paint()
      ..color = grid
      ..strokeWidth = 1;
    for (final g in [0, 25, 50, 75, 100]) {
      canvas.drawLine(
        Offset(left, y(g.toDouble())),
        Offset(size.width - right, y(g.toDouble())),
        gridPaint,
      );
      final tp = TextPainter(
        text: TextSpan(
          text: '$g',
          style: TextStyle(color: sub, fontSize: 10),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(
        canvas,
        Offset(left - 6 - tp.width, y(g.toDouble()) - tp.height / 2),
      );
    }
    Path path(double? Function(ProgressValue) pick) {
      final p = Path();
      var first = true;
      for (var i = 0; i < points.length; i++) {
        final v = pick(points[i]);
        if (v == null) continue;
        first ? p.moveTo(x(i), y(v)) : p.lineTo(x(i), y(v));
        first = false;
      }
      return p;
    }

    final avg = path((p) => p.compare);
    for (final m in avg.computeMetrics()) {
      for (var d = 0.0; d < m.length; d += 9) {
        canvas.drawPath(
          m.extractPath(d, math.min(d + 5, m.length)),
          Paint()
            ..style = PaintingStyle.stroke
            ..color = compare
            ..strokeWidth = 1.4,
        );
      }
    }
    canvas.drawPath(
      path((p) => p.value),
      Paint()
        ..style = PaintingStyle.stroke
        ..color = line
        ..strokeWidth = 2.5
        ..strokeJoin = StrokeJoin.round,
    );
    for (var i = 0; i < points.length; i++) {
      final pt = Offset(x(i), y(points[i].value));
      canvas.drawCircle(pt, 4.5, Paint()..color = line);
      final value = TextPainter(
        text: TextSpan(
          text: '${points[i].value.round()}%',
          style: TextStyle(
            color: text,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final name = TextPainter(
        text: TextSpan(
          text: _short(points[i].label, 12),
          style: TextStyle(color: sub, fontSize: 11),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      double place(double w) => points.length > 1 && i == 0
          ? pt.dx
          : points.length > 1 && i == points.length - 1
          ? pt.dx - w
          : pt.dx - w / 2;
      value.paint(canvas, Offset(place(value.width), pt.dy - 20));
      name.paint(canvas, Offset(place(name.width), size.height - bottom + 10));
    }
  }

  @override
  bool shouldRepaint(_LinePainter old) =>
      old.points != points || old.line != line;
}
