
export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

export const validateIni = (iniContent: string): ValidationResult => {
    if (!iniContent || typeof iniContent !== 'string' || iniContent.trim() === '') {
        return { isValid: false, error: "Generated code is empty." };
    }

    const lines = iniContent.split('\n');
    let inCoreSection = false;
    let inGraphicsSection = false;
    let foundCoreName = false;
    let foundGraphicsImage = false;

    let currentSection = '';

    for (const [index, line] of lines.entries()) {
        const trimmedLine = line.trim();

        if (trimmedLine === '' || trimmedLine.startsWith('#')) {
            continue; // Skip empty lines and comments
        }

        const sectionMatch = trimmedLine.match(/^\s*\[\s*([a-zA-Z0-9_]+)\s*\]\s*$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1].toLowerCase();
            if (currentSection === 'core') inCoreSection = true;
            if (currentSection === 'graphics') inGraphicsSection = true;
            continue;
        }

        const kvMatch = trimmedLine.match(/^\s*([a-zA-Z0-9_]+)\s*:\s*(.+)$/);
        if (!kvMatch) {
            return { isValid: false, error: `Invalid syntax on line ${index + 1}. Expected 'key: value' format, but found: "${trimmedLine}"` };
        }
        
        const key = kvMatch[1].toLowerCase();
        
        if (currentSection === 'core' && key === 'name') {
            foundCoreName = true;
        }
        if (currentSection === 'graphics' && key === 'image') {
            foundGraphicsImage = true;
        }
    }

    if (!inCoreSection) {
        return { isValid: false, error: "The generated code is missing the required '[core]' section." };
    }

    if (!foundCoreName) {
        return { isValid: false, error: "The '[core]' section is missing the required 'name' key." };
    }

    if (!inGraphicsSection) {
        return { isValid: false, error: "The generated code is missing the required '[graphics]' section." };
    }

    if (!foundGraphicsImage) {
        return { isValid: false, error: "The '[graphics]' section is missing the required 'image' key." };
    }

    return { isValid: true };
};
