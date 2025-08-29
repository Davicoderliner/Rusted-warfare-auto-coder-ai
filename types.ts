
export interface ChatMessage {
    role: 'user' | 'ai';
    content: string;
}

export interface GeneratedUnit {
    id: string;
    unitName: string; // e.g., 'heavy_tank'. This will be the folder name.
    iniFile: {
        name: string; // e.g., 'heavy_tank.ini'
        content: string;
    };
    images: {
        name: string;
        dataUrl: string;
    }[];
}

export interface Mod {
    name: string;
    units: GeneratedUnit[];
}
