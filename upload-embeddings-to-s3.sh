#!/bin/bash

# MamaTega Cosmetics - Upload Embeddings to S3
# This script uploads product embeddings to S3 for the AI chat system

echo "🚀 MamaTega Cosmetics - Uploading Embeddings to S3"
echo "=================================================="

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    echo "   Visit: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured."
    echo "   Please run: aws configure"
    echo "   Or set environment variables:"
    echo "   export AWS_ACCESS_KEY_ID=your_access_key"
    echo "   export AWS_SECRET_ACCESS_KEY=your_secret_key"
    echo "   export AWS_DEFAULT_REGION=your_region"
    exit 1
fi

# S3 bucket name (update this to your bucket name)
S3_BUCKET="mamatega-embeddings"

# Check if bucket exists
if ! aws s3 ls "s3://$S3_BUCKET" &> /dev/null; then
    echo "❌ S3 bucket '$S3_BUCKET' does not exist or you don't have access."
    echo "   Please create the bucket first or update the bucket name in this script."
    exit 1
fi

echo "✅ AWS credentials configured"
echo "✅ S3 bucket '$S3_BUCKET' accessible"
echo ""

# Files to upload
FILES=(
    "product_embeddings_with_brands.json"
    "product_embeddings_small.json"
    "products_with_brands.json"
)

# Upload each file
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "📤 Uploading $file..."
        echo "   Size: $(du -h "$file" | cut -f1)"
        
        if aws s3 cp "$file" "s3://$S3_BUCKET/$file" --acl public-read; then
            echo "   ✅ Successfully uploaded $file"
            
            # Get the public URL
            REGION=$(aws configure get region)
            URL="https://$S3_BUCKET.s3.$REGION.amazonaws.com/$file"
            echo "   🔗 Public URL: $URL"
        else
            echo "   ❌ Failed to upload $file"
            exit 1
        fi
        echo ""
    else
        echo "⚠️  File $file not found, skipping..."
        echo ""
    fi
done

echo "🎉 All embeddings uploaded successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Update your Vercel backend to use these S3 URLs"
echo "2. Deploy your backend to Vercel"
echo "3. Update the frontend API URLs to point to your Vercel backend"
echo ""
echo "🔗 S3 URLs:"
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        REGION=$(aws configure get region)
        echo "   $file: https://$S3_BUCKET.s3.$REGION.amazonaws.com/$file"
    fi
done 