const PDFDocument = require('pdfkit');

/**
 * Generate a PDF for all participants who attended all 3 rounds
 * @param {Array} participants - List of participants with { rank, teamName, name, username, r1, r2, r3, cumulative, percentage, submittedAt }
 * @param {Object} meta - Metadata { generatedAt, eventName, totalQualified, maxPossibleScore, averageScore, topScore }
 * @returns {Promise<Buffer>} - Resolves with PDF Buffer
 */
function generateAllRoundsLeaderboardPDF(participants, meta = {}) {
  return new Promise((resolve, reject) => {
    try {
      // Landscape A4 (841.89 x 595.28)
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 36,
        bufferPages: true,
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const pageWidth = 841.89;
      const pageHeight = 595.28;
      const margin = 36;
      const contentWidth = pageWidth - margin * 2; // ~770pt

      const drawHeader = () => {
        // Banner background
        doc.rect(margin, margin, contentWidth, 54).fill('#0f172a');

        // Top colored accent bar
        doc.rect(margin, margin, contentWidth, 4).fill('#ef4444');

        // Header Title
        doc.font('Helvetica-Bold').fontSize(16).fillColor('#ffffff')
          .text(meta.eventName || 'CODE BREAKERS - GRAND SCORECARD', margin + 16, margin + 12);

        // Subtitle
        doc.font('Helvetica').fontSize(9).fillColor('#94a3b8')
          .text('OFFICIAL CUMULATIVE RESULTS • PARTICIPANTS ATTENDING ALL 3 ROUNDS', margin + 16, margin + 32);

        // Header Right Meta
        const dateStr = meta.generatedAt ? new Date(meta.generatedAt).toLocaleString() : new Date().toLocaleString();
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#f87171')
          .text('FINAL RESULTS REPORT', margin + contentWidth - 190, margin + 14, { width: 174, align: 'right' });
        doc.font('Helvetica').fontSize(7.5).fillColor('#cbd5e1')
          .text(`Generated: ${dateStr}`, margin + contentWidth - 190, margin + 28, { width: 174, align: 'right' });
      };

      const drawStatsCards = (startY) => {
        const cardWidth = (contentWidth - 24) / 4;
        const cardHeight = 42;

        const cards = [
          { label: 'QUALIFIED PARTICIPANTS', value: `${participants.length} Teams`, color: '#3b82f6', bg: '#eff6ff' },
          { label: 'HIGHEST CUMULATIVE SCORE', value: `${meta.topScore ?? (participants[0]?.cumulative || 0)} pts`, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'AVERAGE SCORE', value: `${meta.averageScore ?? 0} pts`, color: '#ca8a04', bg: '#fefce8' },
          { label: 'MAX POSSIBLE SCORE', value: `${meta.maxPossibleScore || 100} pts`, color: '#dc2626', bg: '#fef2f2' },
        ];

        cards.forEach((c, i) => {
          const x = margin + i * (cardWidth + 8);
          doc.rect(x, startY, cardWidth, cardHeight).fillAndStroke(c.bg, '#cbd5e1');
          doc.rect(x, startY, 4, cardHeight).fill(c.color);

          doc.font('Helvetica-Bold').fontSize(7).fillColor('#64748b')
            .text(c.label, x + 10, startY + 8, { width: cardWidth - 16 });
          doc.font('Helvetica-Bold').fontSize(12).fillColor(c.color)
            .text(c.value, x + 10, startY + 22, { width: cardWidth - 16 });
        });

        return startY + cardHeight + 12;
      };

      const columns = [
        { header: 'RANK', key: 'rank', width: 44, align: 'center' },
        { header: 'TEAM / PARTICIPANT', key: 'teamName', width: 180, align: 'left' },
        { header: 'USERNAME', key: 'username', width: 100, align: 'left' },
        { header: 'R1: MCQ (30)', key: 'r1', width: 90, align: 'center' },
        { header: 'R2: OUTPUT (30)', key: 'r2', width: 96, align: 'center' },
        { header: 'R3: DEBUG (40)', key: 'r3', width: 96, align: 'center' },
        { header: 'CUMULATIVE (100)', key: 'cumulative', width: 104, align: 'center' },
        { header: 'STATUS', key: 'status', width: 60, align: 'center' },
      ];

      const drawTableHeader = (y) => {
        // Header background
        doc.rect(margin, y, contentWidth, 22).fill('#1e293b');

        let curX = margin;
        columns.forEach((col) => {
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
            .text(col.header, curX + 4, y + 6, {
              width: col.width - 8,
              align: col.align,
            });
          curX += col.width;
        });

        return y + 22;
      };

      // Draw first page
      drawHeader();
      let currentY = margin + 54 + 10;
      currentY = drawStatsCards(currentY);
      currentY = drawTableHeader(currentY);

      const rowHeight = 22;
      const bottomLimit = pageHeight - margin - 30;

      if (participants.length === 0) {
        doc.rect(margin, currentY, contentWidth, 36).fillAndStroke('#ffffff', '#e2e8f0');
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#64748b')
          .text('No participants have completed all 3 rounds yet.', margin, currentY + 12, { width: contentWidth, align: 'center' });
      } else {
        participants.forEach((p, idx) => {
          // Check pagination
          if (currentY + rowHeight > bottomLimit) {
            doc.addPage();
            drawHeader();
            currentY = margin + 54 + 12;
            currentY = drawTableHeader(currentY);
          }

          // Row styling
          const isTop1 = p.rank === 1;
          const isTop2 = p.rank === 2;
          const isTop3 = p.rank === 3;
          const isEven = idx % 2 === 0;

          let rowBg = isEven ? '#ffffff' : '#f8fafc';
          let borderCol = '#e2e8f0';

          if (isTop1) {
            rowBg = '#fefce8';
            borderCol = '#facc15';
          } else if (isTop2) {
            rowBg = '#f8fafc';
            borderCol = '#94a3b8';
          } else if (isTop3) {
            rowBg = '#fff7ed';
            borderCol = '#fdba74';
          }

          doc.rect(margin, currentY, contentWidth, rowHeight).fillAndStroke(rowBg, borderCol);

          let curX = margin;

          // 1. Rank
          let rankText = String(p.rank);
          if (isTop1) rankText = `[1]`;
          else if (isTop2) rankText = `[2]`;
          else if (isTop3) rankText = `[3]`;

          doc.font(isTop1 || isTop2 || isTop3 ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8.5)
            .fillColor(isTop1 ? '#ca8a04' : isTop2 ? '#475569' : isTop3 ? '#c2410c' : '#334155')
            .text(rankText, curX + 2, currentY + 6, { width: columns[0].width - 4, align: 'center' });
          curX += columns[0].width;

          // 2. Team Name
          const teamDisplayName = p.teamName || p.name || p.username || 'Unnamed Team';
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a')
            .text(teamDisplayName.slice(0, 32), curX + 6, currentY + 6, { width: columns[1].width - 12, ellipsis: true });
          curX += columns[1].width;

          // 3. Username
          doc.font('Helvetica').fontSize(7.5).fillColor('#64748b')
            .text(p.username || '-', curX + 4, currentY + 6, { width: columns[2].width - 8, ellipsis: true });
          curX += columns[2].width;

          // 4. Round 1 Score
          doc.font('Helvetica-Bold').fontSize(8).fillColor(p.r1 > 0 ? '#15803d' : '#94a3b8')
            .text(`${p.r1} pts`, curX + 4, currentY + 6, { width: columns[3].width - 8, align: 'center' });
          curX += columns[3].width;

          // 5. Round 2 Score
          doc.font('Helvetica-Bold').fontSize(8).fillColor(p.r2 > 0 ? '#15803d' : '#94a3b8')
            .text(`${p.r2} pts`, curX + 4, currentY + 6, { width: columns[4].width - 8, align: 'center' });
          curX += columns[4].width;

          // 6. Round 3 Score
          doc.font('Helvetica-Bold').fontSize(8).fillColor(p.r3 > 0 ? '#15803d' : '#94a3b8')
            .text(`${p.r3} pts`, curX + 4, currentY + 6, { width: columns[5].width - 8, align: 'center' });
          curX += columns[5].width;

          // 7. Cumulative Score
          doc.font('Helvetica-Bold').fontSize(9)
            .fillColor(isTop1 ? '#dc2626' : '#0f172a')
            .text(`${p.cumulative} pts (${p.percentage || Math.round((p.cumulative / (meta.maxPossibleScore || 100)) * 100)}%)`, curX + 4, currentY + 6, {
              width: columns[6].width - 8,
              align: 'center',
            });
          curX += columns[6].width;

          // 8. Status Badge
          doc.font('Helvetica-Bold').fontSize(7).fillColor('#16a34a')
            .text('COMPLETE', curX + 2, currentY + 6, { width: columns[7].width - 4, align: 'center' });

          currentY += rowHeight;
        });
      }

      // Add page footers to all pages
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        // Divider
        doc.rect(margin, pageHeight - margin - 16, contentWidth, 0.5).fill('#cbd5e1');

        // Footer note
        doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8')
          .text(
            'AIDEX CODE BREAKERS 2026 • OFFICIAL FINAL SCORECARD & VERIFIED RESULTS',
            margin,
            pageHeight - margin - 10,
            { width: contentWidth / 2, align: 'left' }
          );

        // Page number
        doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8')
          .text(
            `Page ${i + 1} of ${range.count}`,
            margin + contentWidth / 2,
            pageHeight - margin - 10,
            { width: contentWidth / 2, align: 'right' }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate an individual Participant Scorecard PDF
 * @param {Object} user - User doc/obj
 * @param {Object} scoreData - { r1, r2, r3, cumulative, percentage, rank, submittedAt }
 * @param {Object} meta - Event meta
 * @returns {Promise<Buffer>}
 */
function generateParticipantScorecardPDF(user, scoreData, meta = {}) {
  return new Promise((resolve, reject) => {
    try {
      // Portrait A4 (595.28 x 841.89)
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: 40,
        bufferPages: true,
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2; // ~515pt

      // Outer Decorative Border
      doc.rect(margin - 10, margin - 10, contentWidth + 20, pageHeight - margin * 2 + 20)
        .lineWidth(1.5).strokeColor('#ef4444');
      doc.rect(margin - 6, margin - 6, contentWidth + 12, pageHeight - margin * 2 + 12)
        .lineWidth(0.5).strokeColor('#cbd5e1');

      // Top Header Card
      doc.rect(margin, margin, contentWidth, 76).fill('#0f172a');
      doc.rect(margin, margin, contentWidth, 4).fill('#ef4444');

      doc.font('Helvetica-Bold').fontSize(18).fillColor('#ffffff')
        .text('CODE BREAKERS 2026', margin + 20, margin + 16);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#f87171')
        .text('OFFICIAL PARTICIPANT SCORECARD & CERTIFICATE OF COMPLETION', margin + 20, margin + 40);
      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
        .text(`Event Date: ${new Date().toLocaleDateString()} • Issued by AIDEX Administration`, margin + 20, margin + 55);

      let y = margin + 76 + 24;

      // Participant Details Box
      doc.rect(margin, y, contentWidth, 80).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.rect(margin, y, 4, 80).fill('#3b82f6');

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('TEAM / PARTICIPANT NAME', margin + 16, y + 12);
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text(user.teamName || user.name || user.username, margin + 16, y + 24);

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('USERNAME / ID', margin + 270, y + 12);
      doc.font('Helvetica').fontSize(11).fillColor('#334155').text(user.username, margin + 270, y + 24);

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('STATUS', margin + 16, y + 48);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#16a34a').text('✔ ATTENDED & COMPLETED ALL 3 ROUNDS', margin + 16, y + 60);

      if (scoreData.rank) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('OVERALL RANK', margin + 270, y + 48);
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#dc2626').text(`Rank #${scoreData.rank}`, margin + 270, y + 60);
      }

      y += 80 + 24;

      // Section Title: Round Performance Breakdown
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('PERFORMANCE BREAKDOWN ACROSS ALL ROUNDS', margin, y);
      y += 18;

      // Table of rounds
      const rounds = [
        { name: 'Trial 1: Code Recall & Concepts (MCQ)', marks: scoreData.r1 ?? 0, max: 30, pct: Math.round(((scoreData.r1 ?? 0) / 30) * 100) },
        { name: 'Trial 2: Output Prediction & Flow Analysis', marks: scoreData.r2 ?? 0, max: 30, pct: Math.round(((scoreData.r2 ?? 0) / 30) * 100) },
        { name: 'Trial 3: Bug Hunt & Code Optimization', marks: scoreData.r3 ?? 0, max: 40, pct: Math.round(((scoreData.r3 ?? 0) / 40) * 100) },
      ];

      // Table Header
      doc.rect(margin, y, contentWidth, 24).fill('#1e293b');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
        .text('ROUND / TRIAL', margin + 12, y + 7, { width: 240 })
        .text('MARKS OBTAINED', margin + 260, y + 7, { width: 110, align: 'center' })
        .text('MAX MARKS', margin + 380, y + 7, { width: 60, align: 'center' })
        .text('PERCENTAGE', margin + 445, y + 7, { width: 60, align: 'center' });

      y += 24;

      rounds.forEach((r, idx) => {
        const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        doc.rect(margin, y, contentWidth, 28).fillAndStroke(bg, '#e2e8f0');

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#334155')
          .text(r.name, margin + 12, y + 9, { width: 240 });
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#16a34a')
          .text(`${r.marks} pts`, margin + 260, y + 9, { width: 110, align: 'center' });
        doc.font('Helvetica').fontSize(8.5).fillColor('#64748b')
          .text(`${r.max} pts`, margin + 380, y + 9, { width: 60, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a')
          .text(`${r.pct}%`, margin + 445, y + 9, { width: 60, align: 'center' });

        y += 28;
      });

      // Total Row
      doc.rect(margin, y, contentWidth, 34).fillAndStroke('#eff6ff', '#93c5fd');
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e40af')
        .text('CUMULATIVE TOTAL SCORE', margin + 12, y + 11, { width: 240 });
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#dc2626')
        .text(`${scoreData.cumulative} pts`, margin + 260, y + 9, { width: 110, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e40af')
        .text('100 pts', margin + 380, y + 11, { width: 60, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#dc2626')
        .text(`${scoreData.percentage || Math.round((scoreData.cumulative / 100) * 100)}%`, margin + 445, y + 11, { width: 60, align: 'center' });

      y += 34 + 36;

      // Summary Assessment Card
      doc.rect(margin, y, contentWidth, 70).fillAndStroke('#f0fdf4', '#86efac');
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#166534')
        .text('★ PARTICIPATION & COMPLETION REMARK', margin + 16, y + 12);
      doc.font('Helvetica').fontSize(8.5).fillColor('#15803d')
        .text(
          `Congratulations! You have successfully completed all 3 trials of the Code Breakers competition. ` +
          `Your total cumulative score of ${scoreData.cumulative} / 100 points (${scoreData.percentage || Math.round((scoreData.cumulative / 100) * 100)}%) ` +
          `has been officially authenticated and recorded in the event leaderboard.`,
          margin + 16,
          y + 28,
          { width: contentWidth - 32, lineGap: 3 }
        );

      // Signatures
      const sigY = pageHeight - margin - 90;
      doc.rect(margin + 30, sigY, 160, 0.75).fill('#94a3b8');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569')
        .text('EVENT COORDINATOR', margin + 30, sigY + 6, { width: 160, align: 'center' });
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
        .text('AIDEX Technical Committee', margin + 30, sigY + 18, { width: 160, align: 'center' });

      doc.rect(margin + contentWidth - 190, sigY, 160, 0.75).fill('#94a3b8');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569')
        .text('CHIEF EXAMINER', margin + contentWidth - 190, sigY + 6, { width: 160, align: 'center' });
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
        .text('Code Breakers Evaluation Board', margin + contentWidth - 190, sigY + 18, { width: 160, align: 'center' });

      // Footer
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
        .text(
          `Generated on ${new Date().toLocaleString()} • AIDEX Code Breakers System Verified`,
          margin,
          pageHeight - margin - 14,
          { width: contentWidth, align: 'center' }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateAllRoundsLeaderboardPDF,
  generateParticipantScorecardPDF,
};
