export interface KtpExtractionResponseDto {
  nik?: string;
  namaPemilik?: string;
  tempatLahir?: string;
  tanggalLahir?: string; // Format: YYYY-MM-DD
  jenisKelamin?: 'Laki-laki' | 'Perempuan';
  alamatKtp?: string;
  rtRw?: string;
  kelurahanKtp?: string;
  kecamatanKtp?: string;
  kotaKabupatenKtp?: string;
  provinsiKtp?: string;
  agama?: string;
  statusPerkawinan?: string;
  pekerjaan?: string;
  confidence?: number;
}
