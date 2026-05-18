import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

@Injectable()
export class DocumentsService {
  /**
   * Helper method to fetch map tile with standard browser user-agent and fallbacks.
   */
  private async fetchTile(zoom: number, tx: number, ty: number): Promise<Buffer | null> {
    const urls = [
      `https://basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${tx}/${ty}.png`,
      `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NIB-Assistant/1.0'
          }
        });
        if (res.ok) {
          const ab = await res.arrayBuffer();
          return Buffer.from(ab);
        }
      } catch (e) {
        // try next URL
      }
    }
    return null;
  }

  /**
   * Generates a beautifully formatted NIB Administration Document PDF.
   * Downloads a dynamic static map image of the location coordinates and embeds it.
   */
  async generateAdministrationPdf(data: {
    alamatUsaha: string;
    latitude: string;
    longitude: string;
    luasTanah: string;
  }): Promise<Buffer> {
    return new Promise<Buffer>(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        // --- PDF Header ---
        doc
          .fillColor('#0284c7') // Sky blue accent
          .rect(50, 40, doc.page.width - 100, 8)
          .fill();
          
        doc.moveDown(1.5);

        // --- Title ---
        doc
          .fillColor('#1e293b')
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('DOKUMEN ADMINISTRASI PERNYATAAN LOKASI USAHA', { align: 'center' })
          .moveDown(0.2);

        doc
          .strokeColor('#cbd5e1')
          .lineWidth(1)
          .moveTo(50, doc.y)
          .lineTo(doc.page.width - 50, doc.y)
          .stroke();

        doc.moveDown(1.5);

        // --- Data Details Card ---
        const startY = doc.y;

        doc
          .fillColor('#f8fafc')
          .rect(50, startY, doc.page.width - 100, 115)
          .fill();

        doc
          .strokeColor('#e2e8f0')
          .rect(50, startY, doc.page.width - 100, 115)
          .stroke();

        // Content on Top of the Card
        doc.fillColor('#334155').fontSize(11).font('Helvetica-Bold');
        
        doc.text('INFORMASI LOKASI & LAHAN', 65, startY + 15);
        
        doc.font('Helvetica').fontSize(10);
        
        // Row 1: Alamat Usaha
        doc.font('Helvetica-Bold').text('Alamat Usaha:', 65, startY + 40);
        doc.font('Helvetica').text(data.alamatUsaha.toUpperCase(), 175, startY + 40, { width: doc.page.width - 260 });

        // Row 2: Koordinat
        doc.font('Helvetica-Bold').text('Titik Koordinat:', 65, startY + 70);
        doc.font('Helvetica').text(`${data.latitude}, ${data.longitude}`, 175, startY + 70);

        // Row 3: Luas Lahan
        doc.font('Helvetica-Bold').text('Luas Lahan Usaha:', 65, startY + 90);
        doc.font('Helvetica').text(`${data.luasTanah} m²`, 175, startY + 90);

        doc.x = 50; // Reset X position
        doc.y = startY + 140; // Push Y down

        // --- Map Snapshot Header ---
        doc
          .fillColor('#1e293b')
          .font('Helvetica-Bold')
          .fontSize(12)
          .text('LAMPIRAN: TANGKAPAN PETA KOORDINAT', { align: 'center' })
          .moveDown(0.8);

        // --- Fetch & Embed OpenStreetMap Static Map ---
        try {
          const latNum = parseFloat(data.latitude || '-6.2088');
          const lonNum = parseFloat(data.longitude || '106.8456');
          const zoom = 16;
          const n = Math.pow(2, zoom);
          const x = ((lonNum + 180) / 360) * n;
          const latRad = (latNum * Math.PI) / 180;
          const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;

          const cx = Math.floor(x);
          const cy = Math.floor(y);

          // Fetch 3x3 tiles in parallel
          const tilesToFetch = [];
          for (let dyIndex = -1; dyIndex <= 1; dyIndex++) {
            for (let dxIndex = -1; dxIndex <= 1; dxIndex++) {
              tilesToFetch.push({
                tx: cx + dxIndex,
                ty: cy + dyIndex,
              });
            }
          }

          const tileBuffers = await Promise.all(
            tilesToFetch.map(async (tile) => {
              const buffer = await this.fetchTile(zoom, tile.tx, tile.ty);
              return { ...tile, buffer };
            }),
          );

          const imgWidth = 420;
          const imgHeight = 280;
          const imgX = (doc.page.width - imgWidth) / 2;
          const mapY = doc.y;

          // Bounding Box Center coords
          const boxCenterX = imgX + imgWidth / 2;
          const boxCenterY = mapY + imgHeight / 2;
          const tileSize = 150; // tile display size on PDF

          doc.save();
          // Clip drawing to our bounding box
          doc.rect(imgX, mapY, imgWidth, imgHeight).clip();

          // Render tiles side-by-side using calculated draw coordinates
          for (const tile of tileBuffers) {
            if (tile.buffer) {
              const dx = boxCenterX + (tile.tx - x) * tileSize;
              const dy = boxCenterY + (tile.ty - y) * tileSize;
              doc.image(tile.buffer, dx, dy, { width: tileSize, height: tileSize });
            }
          }
          doc.restore();

          // Draw subtle border around map
          doc
            .strokeColor('#cbd5e1')
            .lineWidth(1)
            .rect(imgX, mapY, imgWidth, imgHeight)
            .stroke();

          // Draw vector pin marker exactly at boxCenterX, boxCenterY
          doc.save();
          doc.fillColor('#ef4444');
          doc.strokeColor('#ffffff').lineWidth(1.5);
          doc.circle(boxCenterX, boxCenterY - 12, 6).fillAndStroke();
          doc.moveTo(boxCenterX - 6, boxCenterY - 10)
             .lineTo(boxCenterX, boxCenterY)
             .lineTo(boxCenterX + 6, boxCenterY - 10)
             .closePath()
             .fillAndStroke();
          doc.fillColor('#ffffff');
          doc.circle(boxCenterX, boxCenterY - 12, 2.5).fill();
          doc.restore();

          doc.y = mapY + imgHeight + 25;
        } catch (mapErr) {
          doc
            .fillColor('#ef4444')
            .text('[Gagal memuat tangkapan peta dari OpenStreetMap]', { align: 'center' });
          doc.y += 30;
        }

        // --- Signature Section ---
        doc.moveDown(1.5);
        const sigY = doc.y;

        doc
          .fillColor('#0f172a')
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('Pemohon Perizinan NIB,', doc.page.width - 250, sigY + 20, { align: 'center', width: 200 })
          .moveDown(3.5);

        doc
          .strokeColor('#94a3b8')
          .lineWidth(0.5)
          .moveTo(doc.page.width - 250, doc.y)
          .lineTo(doc.page.width - 50, doc.y)
          .stroke();

        doc
          .fontSize(9)
          .font('Helvetica')
          .text('TANDA TANGAN DIGITAL', doc.page.width - 250, doc.y + 5, { align: 'center', width: 200 });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Converts a base64 location photograph directly to a clean PDF page.
   */
  async convertPhotoToPdf(base64Image: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        // Clean base64 string
        const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(cleanBase64, 'base64');

        // Document Title
        doc
          .fillColor('#0f172a')
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('LAMPIRAN DOKUMEN: FOTO LOKASI USAHA', { align: 'center' })
          .moveDown(0.5);

        doc
          .strokeColor('#cbd5e1')
          .lineWidth(1)
          .moveTo(40, doc.y)
          .lineTo(doc.page.width - 40, doc.y)
          .stroke();

        doc.moveDown(1.5);

        // Embed the Location Photo
        // We set a clean box to fit the photo nicely
        const boxWidth = doc.page.width - 80;
        const boxHeight = doc.page.height - doc.y - 100;

        doc.image(imageBuffer, 40, doc.y, {
          fit: [boxWidth, boxHeight],
          align: 'center',
          valign: 'center',
        });

        // Add verification footer
        doc
          .fillColor('#64748b')
          .fontSize(9)
          .font('Helvetica')
          .text('Foto Lokasi Usaha ini diambil secara langsung dari sistem pemohon.', 40, doc.page.height - 60, {
            align: 'center',
          });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
