import 'package:flutter/material.dart';

const bastaaEmerald = Color(0xFF0F5338);
const bastaaTerracotta = Color(0xFFD95D39);

/// The Bastaa mark: a round "b" with a saffron dot (same drawing as tool/make_icons.py).
class BastaaMark extends StatelessWidget {
  const BastaaMark({super.key, this.size = 56});
  final double size;

  @override
  Widget build(BuildContext context) => Semantics(label: 'Bastaa', child: CustomPaint(size: Size.square(size), painter: _MarkPainter()));
}

class _MarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    canvas.drawRRect(RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(s * 0.22)), Paint()..color = bastaaEmerald);
    final white = Paint()..color = Colors.white;
    canvas.drawRRect(RRect.fromLTRBR(s * 0.265, s * 0.17, s * 0.405, s * 0.665, Radius.circular(s * 0.07)), white);
    final centre = Offset(s * 0.5, s * 0.595);
    canvas.drawPath(
      Path()
        ..fillType = PathFillType.evenOdd
        ..addOval(Rect.fromCircle(center: centre, radius: s * 0.235))
        ..addOval(Rect.fromCircle(center: centre, radius: s * 0.095)),
      white,
    );
    canvas.drawCircle(centre, s * 0.062, Paint()..color = bastaaTerracotta);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
