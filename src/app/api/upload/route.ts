import { v2 as cloudinary } from 'cloudinary';
import { NextResponse } from 'next/server';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  // Add other properties if you plan to use them
}

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Cloudinary
    const uploadResult: CloudinaryUploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream({
        resource_type: 'auto',
        folder: 'medical_reports' // Optional: organize uploads in a specific folder
      }, (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return reject(error);
        }
        resolve(result as CloudinaryUploadResult);
      }).end(buffer);
    });

    return NextResponse.json({ success: true, url: uploadResult.secure_url });

  } catch (error: any) {
    console.error("Error in upload API route:", error);
    return NextResponse.json({ success: false, message: (error as Error).message || 'Upload failed' }, { status: 500 });
  }
} 