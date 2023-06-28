import { Resource } from "./Resource";

export class FileSystem extends Resource {
  url() {
    return `https://elasticfilesystem.${this.region}.amazonaws.com/2015-02-01/file-systems`;
  }

  toJSON() {
    return JSON.stringify({
      Backup: true,
      CreationToken: this.name,
      Encrypted: true,
      ThroughputMode: "elastic",
      Tags: [
        {
          Key: "deployed-by",
          Value: "servicetop",
        },
        {
          Key: "Name",
          Value: this.name,
        },
      ],
    });
  }
}
