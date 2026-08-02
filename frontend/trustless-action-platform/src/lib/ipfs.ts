type MovementManifest = {
  description: string;
  images: string[];
  media: string[];
};

async function pinFile(file: File): Promise<string> {
  const data1 = new FormData();
  data1.append("file", file);
  const url = "https://api.pinata.cloud/pinning/pinFileToIPFS";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_PINATA_JWT}`,
    },
    body: data1,
  });

  const data = await response.json();
  if (response.ok) {
    return data.IpfsHash;
  } else {
    return Promise.reject(new Error(data.error ?? "Pinata upload failed"));
  }
}

async function pinJSON(movementManifest: MovementManifest): Promise<string> {
  const url = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_PINATA_JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pinataContent: movementManifest }),
  });

  const data = await response.json();
  if (response.ok) {
    return data.IpfsHash;
  } else {
    return Promise.reject(new Error(data.error ?? "Pinata upload failed"));
  }
}

function buildMovementManifest(
  images: string[],
  description: string,
  media: string[] = [],
): MovementManifest {
  return { description, images, media };
}

export default async function uploadMovementWiki(
  imageFiles: File[],
  description: string,
): Promise<string> {
  const imageCids = await Promise.all(imageFiles.map(pinFile));
  const manifest = buildMovementManifest(imageCids, description);
  const manifestCid = await pinJSON(manifest);
  return manifestCid;
}
