using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;

public static class PosterGenerator
{
    private static GraphicsPath CreateRoundedRectanglePath(float x, float y, float w, float h, float r)
    {
        var path = new GraphicsPath();
        float d = r * 2.0f;
        path.AddArc(x, y, d, d, 180, 90);
        path.AddArc(x + w - d, y, d, d, 270, 90);
        path.AddArc(x + w - d, y + h - d, d, d, 0, 90);
        path.AddArc(x, y + h - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static void DrawCornerScrew(Graphics g, float cx, float cy, float radius)
    {
        using (var washBrush = new SolidBrush(Color.FromArgb(210, 215, 225)))
        using (var washPen = new Pen(Color.FromArgb(120, 125, 135), 1.5f))
        using (var domeBrush = new SolidBrush(Color.FromArgb(160, 165, 175)))
        using (var domePen = new Pen(Color.FromArgb(90, 95, 105), 1.0f))
        using (var slotPen = new Pen(Color.FromArgb(60, 65, 75), 2.0f))
        {
            g.FillEllipse(washBrush, cx - radius, cy - radius, radius * 2, radius * 2);
            g.DrawEllipse(washPen, cx - radius, cy - radius, radius * 2, radius * 2);

            float innerR = radius - 3.5f;
            g.FillEllipse(domeBrush, cx - innerR, cy - innerR, innerR * 2, innerR * 2);
            g.DrawEllipse(domePen, cx - innerR, cy - innerR, innerR * 2, innerR * 2);

            g.DrawLine(slotPen, cx - innerR + 2, cy, cx + innerR - 2, cy);
            g.DrawLine(slotPen, cx, cy - innerR + 2, cx, cy + innerR - 2);
        }
    }

    private static void DrawPriceBadge(Graphics g, float cx, float cy, float radius, string priceText)
    {
        using (var bgBrush = new SolidBrush(Color.White))
        using (var borderPen = new Pen(Color.FromArgb(18, 25, 38), 3.0f))
        using (var font = new Font("Arial Black", 18, FontStyle.Bold))
        using (var textBrush = new SolidBrush(Color.FromArgb(18, 25, 38)))
        using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
        {
            g.FillEllipse(bgBrush, cx - radius, cy - radius, radius * 2, radius * 2);
            g.DrawEllipse(borderPen, cx - radius, cy - radius, radius * 2, radius * 2);
            g.DrawString(priceText, font, textBrush, new RectangleF(cx - radius, cy - radius + 2, radius * 2, radius * 2), sf);
        }
    }

    private static void DrawDottedVLine(Graphics g, float x, float y1, float y2, float spacing, float dotR, Color color)
    {
        using (var brush = new SolidBrush(color))
        {
            for (float y = y1; y <= y2; y += spacing)
            {
                g.FillEllipse(brush, x - dotR, y - dotR, dotR * 2, dotR * 2);
            }
        }
    }

    private static void DrawDottedHLine(Graphics g, float x1, float x2, float y, float spacing, float dotR, Color color)
    {
        using (var brush = new SolidBrush(color))
        {
            for (float x = x1; x <= x2; x += spacing)
            {
                g.FillEllipse(brush, x - dotR, y - dotR, dotR * 2, dotR * 2);
            }
        }
    }

    public static void GenerateAll(string baseDir)
    {
        string[] targetDirs = new string[]
        {
            Path.Combine(baseDir, "unity-client", "Assets", "Textures"),
            Path.Combine(baseDir, "unity-client", "Assets", "StreamingAssets", "Textures"),
            Path.Combine(baseDir, "Builds", "Windows", "Textures"),
            Path.Combine(baseDir, "Builds", "Windows", "MyVirtualCommunity_Data", "Textures"),
            Path.Combine(baseDir, "Builds", "Windows", "MyVirtualCommunity_Data", "StreamingAssets", "Textures")
        };

        foreach (var dir in targetDirs)
        {
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
        }

        // =====================================================================
        // BOARD 1: LUNES - MARTES (1280 x 560)
        // =====================================================================
        int w1 = 1280, h1 = 560;
        using (var bmp1 = new Bitmap(w1, h1))
        using (var g1 = Graphics.FromImage(bmp1))
        {
            g1.SmoothingMode = SmoothingMode.AntiAlias;
            g1.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

            // Outer dark charcoal frame
            g1.Clear(Color.FromArgb(24, 26, 30));
            using (var outerPath1 = CreateRoundedRectanglePath(4, 4, w1 - 8, h1 - 8, 18))
            using (var outerPen1 = new Pen(Color.FromArgb(65, 70, 80), 3.5f))
            {
                g1.DrawPath(outerPen1, outerPath1);
            }

            DrawCornerScrew(g1, 24, 24, 11);
            DrawCornerScrew(g1, w1 - 24, 24, 11);
            DrawCornerScrew(g1, 24, h1 - 24, 11);
            DrawCornerScrew(g1, w1 - 24, h1 - 24, 11);

            // Header strip (Parchment)
            float headerY = 18, headerH = 92;
            using (var headerPath = CreateRoundedRectanglePath(18, headerY, w1 - 36, headerH, 10))
            using (var parchBrush = new SolidBrush(Color.FromArgb(224, 216, 202)))
            {
                g1.FillPath(parchBrush, headerPath);
            }

            // Wing Spot Logo badge
            float logoX = 36, logoY = headerY + 16, logoW = 120, logoH = 60;
            using (var logoPath = CreateRoundedRectanglePath(logoX, logoY, logoW, logoH, 10))
            using (var logoBg = new SolidBrush(Color.FromArgb(192, 34, 30)))
            using (var logoBorder = new Pen(Color.FromArgb(242, 196, 42), 3))
            using (var wingBrush = new SolidBrush(Color.FromArgb(242, 196, 42)))
            using (var logoFont = new Font("Arial Black", 12, FontStyle.Bold))
            using (var logoTextBrush = new SolidBrush(Color.White))
            using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
            {
                g1.FillPath(logoBg, logoPath);
                g1.DrawPath(logoBorder, logoPath);
                g1.FillPolygon(wingBrush, new PointF[] {
                    new PointF(logoX - 8, logoY + 30),
                    new PointF(logoX + 2, logoY + 18),
                    new PointF(logoX + 2, logoY + 42)
                });
                g1.FillPolygon(wingBrush, new PointF[] {
                    new PointF(logoX + logoW + 8, logoY + 30),
                    new PointF(logoX + logoW - 2, logoY + 18),
                    new PointF(logoX + logoW - 2, logoY + 42)
                });
                g1.DrawString("WING SPOT", logoFont, logoTextBrush, new RectangleF(logoX, logoY, logoW, logoH), sf);
            }

            // Center vertical dotted divider across header
            float midX1 = w1 / 2f;
            DrawDottedVLine(g1, midX1, headerY + 10, headerY + headerH - 10, 9, 3, Color.FromArgb(140, 130, 120));

            // Day Headers
            using (var dayFont = new Font("Impact", 42, FontStyle.Regular))
            using (var dayShadow = new SolidBrush(Color.FromArgb(170, 160, 145)))
            using (var dayBrush = new SolidBrush(Color.FromArgb(45, 40, 35)))
            using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
            {
                var lunesRect = new RectangleF(170, headerY + 4, midX1 - 180, headerH);
                var lunesRectS = new RectangleF(172, headerY + 6, midX1 - 180, headerH);
                g1.DrawString("L U N E S", dayFont, dayShadow, lunesRectS, sf);
                g1.DrawString("L U N E S", dayFont, dayBrush, lunesRect, sf);

                var martesRect = new RectangleF(midX1 + 10, headerY + 4, w1 - midX1 - 30, headerH);
                var martesRectS = new RectangleF(midX1 + 12, headerY + 6, w1 - midX1 - 30, headerH);
                g1.DrawString("M A R T E S", dayFont, dayShadow, martesRectS, sf);
                g1.DrawString("M A R T E S", dayFont, dayBrush, martesRect, sf);
            }

            // Main Slate Body
            float bodyY = 120, bodyH = h1 - 22 - bodyY;
            using (var bodyPath = CreateRoundedRectanglePath(18, bodyY, w1 - 36, bodyH, 14))
            using (var slateBrush = new SolidBrush(Color.FromArgb(18, 25, 38)))
            using (var slateBorderPen = new Pen(Color.FromArgb(225, 230, 240), 3.5f))
            {
                g1.FillPath(slateBrush, bodyPath);
                g1.DrawPath(slateBorderPen, bodyPath);
            }

            // Center vertical dotted divider across body
            DrawDottedVLine(g1, midX1, bodyY + 14, bodyY + bodyH - 14, 11, 3.5f, Color.FromArgb(210, 220, 235));

            float rowDivY = bodyY + (bodyH / 2f);

            // LUNES
            float lunesLeft = 50, lunesRight = midX1 - 50;
            using (var lunesFont = new Font("Arial Black", 22, FontStyle.Bold))
            using (var whiteBrush = new SolidBrush(Color.White))
            using (var sfLeft = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Center })
            {
                var r1 = new RectangleF(lunesLeft, bodyY + 15, lunesRight - lunesLeft - 110, (bodyH / 2f) - 20);
                g1.DrawString("- 2 SPOT BURGERS", lunesFont, whiteBrush, r1, sfLeft);
                DrawPriceBadge(g1, lunesRight - 45, bodyY + (bodyH / 4f), 42, "$99");

                DrawDottedHLine(g1, lunesLeft, lunesRight, rowDivY, 11, 3.0f, Color.FromArgb(120, 135, 160));

                var r2 = new RectangleF(lunesLeft, rowDivY + 15, lunesRight - lunesLeft - 110, (bodyH / 2f) - 20);
                g1.DrawString("- 2 SPOT JUNIOR.", lunesFont, whiteBrush, r2, sfLeft);
                DrawPriceBadge(g1, lunesRight - 45, rowDivY + (bodyH / 4f), 42, "$89");
            }

            // MARTES
            float martesLeft = midX1 + 50, martesRight = w1 - 50;
            using (var comboTitleFont = new Font("Arial Black", 21, FontStyle.Bold))
            using (var comboSubFont = new Font("Arial Black", 16, FontStyle.Bold))
            using (var whiteBrush = new SolidBrush(Color.White))
            using (var subBrush = new SolidBrush(Color.FromArgb(215, 225, 240)))
            {
                float mRow1Y = bodyY + 28;
                g1.DrawString("COMBO POWER", comboTitleFont, whiteBrush, martesLeft, mRow1Y);
                g1.DrawString("-PAPAS FRANCESAS", comboSubFont, subBrush, martesLeft + 12, mRow1Y + 36);
                g1.DrawString("-REFRESCO", comboSubFont, subBrush, martesLeft + 12, mRow1Y + 68);
                DrawPriceBadge(g1, martesRight - 45, bodyY + (bodyH / 4f), 44, "$145");

                DrawDottedHLine(g1, martesLeft, martesRight, rowDivY, 11, 3.0f, Color.FromArgb(120, 135, 160));

                float mRow2Y = rowDivY + 28;
                g1.DrawString("COMBO SPOT CHICKEN.", comboTitleFont, whiteBrush, martesLeft, mRow2Y);
                g1.DrawString("-PAPAS FRANCESAS.", comboSubFont, subBrush, martesLeft + 12, mRow2Y + 36);
                g1.DrawString("-REFRESCO.", comboSubFont, subBrush, martesLeft + 12, mRow2Y + 68);
                DrawPriceBadge(g1, martesRight - 45, rowDivY + (bodyH / 4f), 44, "$120");
            }

            foreach (var dir in targetDirs)
            {
                bmp1.Save(Path.Combine(dir, "WingSpot_Promo_Lunes_Martes.png"), System.Drawing.Imaging.ImageFormat.Png);
            }
        }

        // =====================================================================
        // BOARD 2: MIERCOLES - JUEVES (1080 x 560)
        // =====================================================================
        int w2 = 1080, h2 = 560;
        using (var bmp2 = new Bitmap(w2, h2))
        using (var g2 = Graphics.FromImage(bmp2))
        {
            g2.SmoothingMode = SmoothingMode.AntiAlias;
            g2.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

            g2.Clear(Color.FromArgb(24, 26, 30));
            using (var outerPath2 = CreateRoundedRectanglePath(4, 4, w2 - 8, h2 - 8, 18))
            using (var outerPen2 = new Pen(Color.FromArgb(65, 70, 80), 3.5f))
            {
                g2.DrawPath(outerPen2, outerPath2);
            }

            DrawCornerScrew(g2, 24, 24, 11);
            DrawCornerScrew(g2, w2 - 24, 24, 11);
            DrawCornerScrew(g2, 24, h2 - 24, 11);
            DrawCornerScrew(g2, w2 - 24, h2 - 24, 11);

            float headerY = 18, headerH = 92;
            using (var headerPath = CreateRoundedRectanglePath(18, headerY, w2 - 36, headerH, 10))
            using (var parchBrush = new SolidBrush(Color.FromArgb(224, 216, 202)))
            {
                g2.FillPath(parchBrush, headerPath);
            }

            float midX2 = w2 / 2f;
            DrawDottedVLine(g2, midX2, headerY + 10, headerY + headerH - 10, 9, 3, Color.FromArgb(140, 130, 120));

            using (var dayFont = new Font("Impact", 42, FontStyle.Regular))
            using (var dayShadow = new SolidBrush(Color.FromArgb(170, 160, 145)))
            using (var dayBrush = new SolidBrush(Color.FromArgb(45, 40, 35)))
            using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
            {
                var miercolesRect = new RectangleF(20, headerY + 4, midX2 - 30, headerH);
                var miercolesRectS = new RectangleF(22, headerY + 6, midX2 - 30, headerH);
                g2.DrawString("M I E R C O L E S", dayFont, dayShadow, miercolesRectS, sf);
                g2.DrawString("M I E R C O L E S", dayFont, dayBrush, miercolesRect, sf);

                var juevesRect = new RectangleF(midX2 + 10, headerY + 4, w2 - midX2 - 30, headerH);
                var juevesRectS = new RectangleF(midX2 + 12, headerY + 6, w2 - midX2 - 30, headerH);
                g2.DrawString("J U E V E S", dayFont, dayShadow, juevesRectS, sf);
                g2.DrawString("J U E V E S", dayFont, dayBrush, juevesRect, sf);
            }

            float bodyY = 120, bodyH = h2 - 22 - bodyY;
            using (var bodyPath = CreateRoundedRectanglePath(18, bodyY, w2 - 36, bodyH, 14))
            using (var slateBrush = new SolidBrush(Color.FromArgb(18, 25, 38)))
            using (var slateBorderPen = new Pen(Color.FromArgb(225, 230, 240), 3.5f))
            {
                g2.FillPath(slateBrush, bodyPath);
                g2.DrawPath(slateBorderPen, bodyPath);
            }

            DrawDottedVLine(g2, midX2, bodyY + 14, bodyY + bodyH - 14, 11, 3.5f, Color.FromArgb(210, 220, 235));
            float rowDivY = bodyY + (bodyH / 2f);

            // MIERCOLES
            float mierLeft = 45, mierRight = midX2 - 45;
            using (var comboTitleFont = new Font("Arial Black", 21, FontStyle.Bold))
            using (var comboSubFont = new Font("Arial Black", 16, FontStyle.Bold))
            using (var whiteBrush = new SolidBrush(Color.White))
            using (var subBrush = new SolidBrush(Color.FromArgb(215, 225, 240)))
            {
                float mRow1Y = bodyY + 28;
                g2.DrawString("COMBO PHILADELPHIA", comboTitleFont, whiteBrush, mierLeft, mRow1Y);
                g2.DrawString("-PAPAS", comboSubFont, subBrush, mierLeft + 12, mRow1Y + 36);
                g2.DrawString("-REFRESCO", comboSubFont, subBrush, mierLeft + 12, mRow1Y + 68);
                DrawPriceBadge(g2, mierRight - 45, bodyY + (bodyH / 4f), 44, "$125");

                DrawDottedHLine(g2, mierLeft, mierRight, rowDivY, 11, 3.0f, Color.FromArgb(120, 135, 160));

                float mRow2Y = rowDivY + 28;
                g2.DrawString("COMBO SPOT BURGER", comboTitleFont, whiteBrush, mierLeft, mRow2Y);
                g2.DrawString("-PAPAS FRANCESAS", comboSubFont, subBrush, mierLeft + 12, mRow2Y + 36);
                g2.DrawString("-REFRESCO", comboSubFont, subBrush, mierLeft + 12, mRow2Y + 68);
                DrawPriceBadge(g2, mierRight - 45, rowDivY + (bodyH / 4f), 44, "$115");
            }

            // JUEVES
            float juevLeft = midX2 + 45, juevRight = w2 - 45;
            using (var comboTitleFont = new Font("Arial Black", 21, FontStyle.Bold))
            using (var comboSubFont = new Font("Arial Black", 16, FontStyle.Bold))
            using (var whiteBrush = new SolidBrush(Color.White))
            using (var subBrush = new SolidBrush(Color.FromArgb(215, 225, 240)))
            {
                float jRow1Y = bodyY + 28;
                g2.DrawString("COMBO POP CHICKEN", comboTitleFont, whiteBrush, juevLeft, jRow1Y);
                g2.DrawString("-PAPAS FRANCESAS", comboSubFont, subBrush, juevLeft + 12, jRow1Y + 36);
                g2.DrawString("-REFRESCO", comboSubFont, subBrush, juevLeft + 12, jRow1Y + 68);
                DrawPriceBadge(g2, juevRight - 45, bodyY + (bodyH / 4f), 44, "$125");

                DrawDottedHLine(g2, juevLeft, juevRight, rowDivY, 11, 3.0f, Color.FromArgb(120, 135, 160));

                float jRow2Y = rowDivY + 28;
                g2.DrawString("COMBO JALAPENO", comboTitleFont, whiteBrush, juevLeft, jRow2Y);
                g2.DrawString("-PAPAS FRANCESAS", comboSubFont, subBrush, juevLeft + 12, jRow2Y + 36);
                g2.DrawString("-REFRESCO", comboSubFont, subBrush, juevLeft + 12, jRow2Y + 68);
                DrawPriceBadge(g2, juevRight - 45, rowDivY + (bodyH / 4f), 44, "$125");
            }

            foreach (var dir in targetDirs)
            {
                bmp2.Save(Path.Combine(dir, "WingSpot_Promo_Miercoles_Jueves.png"), System.Drawing.Imaging.ImageFormat.Png);
            }
        }

        // =====================================================================
        // ORDER PICKUP SIGN: "RECOJA SU ORDEN AQUI." (1280 x 200)
        // Replaces legacy TextMesh with depth-tested opaque URP material
        // =====================================================================
        int wSign = 1280, hSign = 200;
        using (var bmpSign = new Bitmap(wSign, hSign))
        using (var gSign = Graphics.FromImage(bmpSign))
        {
            gSign.SmoothingMode = SmoothingMode.AntiAlias;
            gSign.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            gSign.Clear(Color.FromArgb(248, 249, 250));

            // Outer subtle border
            using (var borderPen = new Pen(Color.FromArgb(170, 178, 188), 2.5f))
            {
                gSign.DrawRectangle(borderPen, 6, 6, wSign - 12, hSign - 12);
            }
            // Inner crisp commercial border
            using (var innerBorderPen = new Pen(Color.FromArgb(32, 36, 44), 3.5f))
            {
                gSign.DrawRectangle(innerBorderPen, 14, 14, wSign - 28, hSign - 28);
            }

            // Corner mounting screws
            DrawCornerScrew(gSign, 28, 28, 7.5f);
            DrawCornerScrew(gSign, wSign - 28, 28, 7.5f);
            DrawCornerScrew(gSign, 28, hSign - 28, 7.5f);
            DrawCornerScrew(gSign, wSign - 28, hSign - 28, 7.5f);

            // Bold sign text matching reference photograph
            using (var font = new Font("Arial Black", 46, FontStyle.Bold))
            using (var textBrush = new SolidBrush(Color.FromArgb(20, 24, 30)))
            using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
            {
                gSign.DrawString("RECOJA SU ORDEN AQUI.", font, textBrush, new RectangleF(0, 0, wSign, hSign + 2), sf);
            }

            foreach (var dir in targetDirs)
            {
                bmpSign.Save(Path.Combine(dir, "WingSpot_Pass_Sign.png"), System.Drawing.Imaging.ImageFormat.Png);
            }
        }
    }
}
