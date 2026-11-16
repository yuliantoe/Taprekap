import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { EMoneyCard, EMoneyTransaction, ReimburseBatch } from '../types';
import { CATEGORY_LABELS, formatDateShortId, formatDateTimeId, formatRupiah, ISSUER_META } from './formatters';
import { generateCardQrDataUrl } from './qr';

interface GeneratePdfOptions {
  batch: ReimburseBatch;
  transactions: EMoneyTransaction[];
  cards: EMoneyCard[];
}

export async function generateReimbursePdf({
  batch,
  transactions,
  cards,
}: GeneratePdfOptions): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  // Header Band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(batch.companyName || 'LAPORAN REIMBURSE KANTOR', marginX, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text('Laporan Rekapitulasi Reimburse Biaya Transportasi & e-Money', marginX, 17);
  doc.text(`No. Dokumen: ${batch.reportNumber}`, marginX, 22.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  const statusText =
    batch.status === 'approved'
      ? 'STATUS: DISETUJUI'
      : batch.status === 'submitted'
        ? 'STATUS: DIAJUKAN'
        : 'STATUS: DRAFT';
  doc.text(statusText, pageWidth - marginX, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Dicetak: ${formatDateShortId(new Date().toISOString())}`, pageWidth - marginX, 18, {
    align: 'right',
  });

  // Title & Metadata Grid
  let cursorY = 36;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(batch.title, marginX, cursorY);

  cursorY += 6;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX, cursorY, pageWidth - marginX * 2, 26, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Nama Karyawan', marginX + 4, cursorY + 6.5);
  doc.text('ID / NIK', marginX + 4, cursorY + 13);
  doc.text('Departemen / Divisi', marginX + 4, cursorY + 19.5);

  doc.text('Periode Transaksi', pageWidth / 2 + 4, cursorY + 6.5);
  doc.text('Jumlah Transaksi', pageWidth / 2 + 4, cursorY + 13);
  doc.text('Total Klaim Reimburse', pageWidth / 2 + 4, cursorY + 19.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`: ${batch.employeeName}`, marginX + 36, cursorY + 6.5);
  doc.text(`: ${batch.employeeId}`, marginX + 36, cursorY + 13);
  doc.text(`: ${batch.department}`, marginX + 36, cursorY + 19.5);

  doc.text(
    `: ${formatDateShortId(batch.periodStart)} – ${formatDateShortId(batch.periodEnd)}`,
    pageWidth / 2 + 38,
    cursorY + 6.5,
  );
  doc.text(`: ${transactions.length} transaksi`, pageWidth / 2 + 38, cursorY + 13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(29, 78, 216);
  doc.text(`: ${formatRupiah(batch.totalAmount)}`, pageWidth / 2 + 38, cursorY + 19.5);

  cursorY += 32;

  if (batch.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const noteLines = doc.splitTextToSize(`Catatan Pengajuan: ${batch.notes}`, pageWidth - marginX * 2);
    doc.text(noteLines, marginX, cursorY);
    cursorY += noteLines.length * 4.2 + 3;
  }

  // Category Breakdown Line
  const byCategory = new Map<string, number>();
  for (const tx of transactions) {
    const label = CATEGORY_LABELS[tx.category] || tx.category;
    byCategory.set(label, (byCategory.get(label) || 0) + tx.amount);
  }
  const summaryParts = Array.from(byCategory.entries()).map(
    ([label, total]) => `${label}: ${formatRupiah(total)}`,
  );
  if (summaryParts.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(`Ringkasan Kategori: ${summaryParts.join('  |  ')}`, marginX, cursorY);
    cursorY += 5;
  }

  // Transactions Table
  const tableRows = transactions.map((tx, idx) => {
    const card = cards.find((c) => c.id === tx.cardId);
    const issuerName = ISSUER_META[tx.issuer]?.shortName || tx.issuer.toUpperCase();
    const cardDisplay = `${issuerName}\n${card?.cardNumberMasked || tx.cardUid}`;
    const descParts = [tx.merchant];
    if (tx.location) descParts.push(tx.location);
    if (tx.notes) descParts.push(`Ket: ${tx.notes}`);
    if (tx.activityCaption) descParts.push(`Kegiatan: ${tx.activityCaption}`);
    if (tx.receiptImage || tx.activityPhoto) {
      const lampiran = [
        tx.receiptImage ? 'Struk Operator' : null,
        tx.activityPhoto ? 'Foto Kegiatan' : null,
      ]
        .filter(Boolean)
        .join(' & ');
      descParts.push(`[Lampiran: ${lampiran}]`);
    }
    return [
      String(idx + 1),
      formatDateTimeId(tx.timestamp),
      cardDisplay,
      CATEGORY_LABELS[tx.category] || tx.category,
      descParts.join('\n'),
      formatRupiah(tx.amount),
    ];
  });

  autoTable(doc, {
    startY: cursorY,
    head: [['No', 'Waktu Transaksi', 'Kartu e-Money', 'Kategori', 'Lokasi / Keterangan', 'Nominal']],
    body: tableRows,
    foot: [['', '', '', '', 'TOTAL PENGAJUAN REIMBURSE', formatRupiah(batch.totalAmount)]],
    margin: { left: marginX, right: marginX },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    footStyles: {
      fillColor: [239, 246, 255],
      textColor: [29, 78, 216],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 28 },
      2: { cellWidth: 32 },
      3: { cellWidth: 25 },
      4: { cellWidth: 'auto' },
      5: { halign: 'right', cellWidth: 27, fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  const lastTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  let currentY = (lastTable?.finalY || cursorY + 40) + 10;

  // QR Verification Section per Card used in batch
  const usedCards = cards.filter((c) => transactions.some((tx) => tx.cardId === c.id));
  if (usedCards.length > 0) {
    if (currentY + 42 > pageHeight - 45) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Kode QR Verifikasi Kartu e-Money', marginX, currentY);
    currentY += 4;

    const qrBoxWidth = (pageWidth - marginX * 2 - 4) / 2;
    for (let i = 0; i < usedCards.length; i++) {
      const card = usedCards[i];
      const col = i % 2;
      if (col === 0 && i > 0) {
        currentY += 28;
      }
      if (currentY + 26 > pageHeight - 20) {
        doc.addPage();
        currentY = 20;
      }

      const boxX = marginX + col * (qrBoxWidth + 4);
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(boxX, currentY, qrBoxWidth, 24, 1.5, 1.5, 'FD');

      try {
        const qrDataUrl = await generateCardQrDataUrl(card);
        doc.addImage(qrDataUrl, 'PNG', boxX + 2.5, currentY + 2, 20, 20);
      } catch {
        // ignore QR embed failure
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`${ISSUER_META[card.issuer].name}`, boxX + 25, currentY + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`No: ${card.cardNumberMasked}`, boxX + 25, currentY + 12);
      doc.text(`UID: ${card.uid}`, boxX + 25, currentY + 16.5);
      doc.text(`Verifikasi: ${card.verificationCode}`, boxX + 25, currentY + 21);
    }

    currentY += 32;
  }

  // Signature Block
  if (currentY > pageHeight - 40) {
    doc.addPage();
    currentY = 25;
  }

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);

  const col1 = marginX + 18;
  const col2 = pageWidth / 2;
  const col3 = pageWidth - marginX - 18;

  doc.text('Diajukan Oleh,', col1, currentY, { align: 'center' });
  doc.text('Diverifikasi Oleh,', col2, currentY, { align: 'center' });
  doc.text('Disetujui Oleh,', col3, currentY, { align: 'center' });

  doc.setDrawColor(148, 163, 184);
  doc.line(col1 - 22, currentY + 20, col1 + 22, currentY + 20);
  doc.line(col2 - 22, currentY + 20, col2 + 22, currentY + 20);
  doc.line(col3 - 22, currentY + 20, col3 + 22, currentY + 20);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(batch.employeeName, col1, currentY + 25, { align: 'center' });
  doc.text('Bagian Finance / GA', col2, currentY + 25, { align: 'center' });
  doc.text(batch.approverName || 'Pimpinan Divisi', col3, currentY + 25, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`ID: ${batch.employeeId}`, col1, currentY + 29, { align: 'center' });
  doc.text('Verifikasi Struk & Mutasi', col2, currentY + 29, { align: 'center' });
  doc.text('Otorisasi Pembayaran', col3, currentY + 29, { align: 'center' });

  // Lampiran Struk Resmi Operator & Foto Kegiatan
  const txsWithMedia = transactions.filter(
    (tx) => tx.receiptImage || tx.activityPhoto || tx.activityCaption,
  );
  if (txsWithMedia.length > 0) {
    doc.addPage();
    let mediaY = 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('Lampiran Struk Resmi Operator & Foto Kegiatan', marginX, mediaY);
    mediaY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Dokumen: ${batch.reportNumber} · ${batch.title}`, marginX, mediaY);
    mediaY += 8;

    for (const tx of txsWithMedia) {
      if (mediaY + 75 > pageHeight - 18) {
        doc.addPage();
        mediaY = 20;
      }

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(marginX, mediaY, pageWidth - marginX * 2, 68, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(`${tx.merchant} — ${formatRupiah(tx.amount)}`, marginX + 4, mediaY + 6.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `${formatDateTimeId(tx.timestamp)} · ${tx.notes || tx.activityCaption || tx.location}`,
        marginX + 4,
        mediaY + 11.5,
      );

      const imgTop = mediaY + 15;
      const imgWidth = (pageWidth - marginX * 2 - 14) / 2;
      const imgHeight = 48;

      if (tx.receiptImage) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('Struk Resmi Operator:', marginX + 4, imgTop);
        try {
          doc.addImage(tx.receiptImage, 'JPEG', marginX + 4, imgTop + 2, imgWidth, imgHeight - 4);
        } catch {
          doc.text('(Struk terlampir)', marginX + 4, imgTop + 10);
        }
      }

      if (tx.activityPhoto) {
        const rightX = marginX + 4 + imgWidth + 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('Foto Kegiatan Lapangan:', rightX, imgTop);
        try {
          doc.addImage(tx.activityPhoto, 'JPEG', rightX, imgTop + 2, imgWidth, imgHeight - 4);
        } catch {
          doc.text('(Foto terlampir)', rightX, imgTop + 10);
        }
      }

      mediaY += 74;
    }
  }

  const safeSlug = batch.employeeName.replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`Laporan_Reimburse_${batch.reportNumber}_${safeSlug}.pdf`);
}
