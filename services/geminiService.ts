
import { GoogleGenAI, Type } from "@google/genai";
import type { GeneratedUnit } from '../types';

// Assume API_KEY is set in the environment
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    throw new Error("API_KEY environment variable not set");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

const unitGenerationResponseSchema = {
    type: Type.OBJECT,
    properties: {
        unitName: {
            type: Type.STRING,
            description: "The unique identifier for the unit (e.g., 'heavy_tank'). MUST be lowercase_snake_case. This is used for the folder, .ini filename, and the 'name' key in the [core] section."
        },
        iniFileContent: {
            type: Type.STRING,
            description: "The complete Rusted Warfare .ini file content for the unit."
        },
        imagePrompts: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    imageName: { type: Type.STRING, description: "The filename for the image, e.g., 'image.png', 'image_turret.png'." },
                    prompt: { type: Type.STRING, description: "A visually descriptive prompt to generate this specific sprite." }
                },
                required: ["imageName", "prompt"],
            },
        },
    },
    required: ["unitName", "iniFileContent", "imagePrompts"],
};


export const generateUnit = async (userPrompt: string): Promise<GeneratedUnit | null> => {
    try {
        const prompt = `
            You are an expert Rusted Warfare modding assistant. Your task is to generate a complete unit package based on a user's description. A common error in Rusted Warfare modding is "Could not find image in configuration file in section:graphics", which happens when an image filename in the [graphics] section of the .ini file does not exactly match the actual image filename in the mod folder. Your primary goal is to prevent this error.

            User's request: "${userPrompt}"

            **Instructions:**

            1.  **Design the Unit Identifier:**
                *   First, create a unique identifier for this unit. This will be its \`unitName\`.
                *   **CRITICAL:** The \`unitName\` MUST be a single word in \`lowercase_snake_case\`. For example, 'heavy_tank', 'scout_ship', 'artillery_mech'. It must NOT contain spaces or capital letters.
                *   This \`unitName\` will be used for the unit's folder name, its \`.ini\` file name, and its internal \`name\` in the \`[core]\` section.

            2.  **Create the INI File Content:**
                *   Create the complete and valid Rusted Warfare .ini file content.
                *   **CRITICAL:** In the \`[core]\` section, you MUST include a \`name\` key. The value of this key MUST be the exact \`unitName\` you created in step 1. Example: \`name: heavy_tank\`.
                *   In the \`[graphics]\` section, define all necessary images (e.g., \`image\`, \`image_turret\`, \`image_wreak\`). The filenames should be simple, like \`base.png\`, \`turret.png\`, \`dead.png\`.

            3.  **Create Image Prompts and Ensure Consistency (MOST IMPORTANT STEP):**
                *   This step is where you prevent the "Could not find image" error.
                *   For **every single** image file referenced in the \`[graphics]\` section of the INI file, you MUST create a corresponding object in the \`imagePrompts\` array.
                *   **ABSOLUTELY CRITICAL:** The value for the \`imageName\` key in each \`imagePrompts\` object MUST BE AN EXACT, case-sensitive match to the filename string you used as a value in the \`[graphics]\` section of the \`iniFileContent\`.
                *   **Example of what to do:**
                    *   If \`iniFileContent\` has \`image: tank_body.png\`
                    *   Then \`imagePrompts\` must have an object \`{ "imageName": "tank_body.png", ... }\`
                *   **Example of what NOT to do (THIS WILL CAUSE AN ERROR):**
                    *   If \`iniFileContent\` has \`image: tank_body.png\`
                    *   But \`imagePrompts\` has \`{ "imageName": "tank.png", ... }\` or \`{ "imageName": "Tank_Body.png", ... }\`. This mismatch will break the mod.
                *   **CRITICAL STYLE:** All prompts MUST generate a **2D pixel art sprite** from a **strict top-down orthographic perspective**. The style must be consistent with a retro RTS game like Rusted Warfare. The background MUST be black or transparent.

            4.  **Final Verification and Formatting:**
                *   Before creating the final JSON, perform this check: for every key-value pair under \`[graphics]\` (like \`image: some_file.png\`), confirm that there is a corresponding object in \`imagePrompts\` where \`imageName\` is also \`"some_file.png"\`. This check is mandatory.
                *   Return a single, minified JSON object matching the required schema. Do not include any other text, explanations, or markdown formatting.
        `;

        const codeGenResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: unitGenerationResponseSchema,
                temperature: 0.7,
            }
        });

        const jsonString = codeGenResponse.text;
        const parsedResponse = JSON.parse(jsonString);
        
        if (!parsedResponse.unitName || !parsedResponse.iniFileContent || !parsedResponse.imagePrompts) {
            throw new Error("AI response was missing required fields.");
        }
        
        const { unitName, iniFileContent, imagePrompts } = parsedResponse;

        // Generate all required images in parallel
        const imagePromises = imagePrompts.map(async (imageInfo: { imageName: string, prompt: string }) => {
            const imageResponse = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: imageInfo.prompt,
                config: {
                    numberOfImages: 1,
                    aspectRatio: "1:1"
                }
            });
            const base64Image = imageResponse.generatedImages[0].image.imageBytes;
            const imageUrl = `data:image/png;base64,${base64Image}`;
            return { name: imageInfo.imageName, dataUrl: imageUrl };
        });

        const generatedImages = await Promise.all(imagePromises);

        return {
            id: Date.now().toString(),
            unitName: unitName,
            iniFile: {
                name: `${unitName}.ini`,
                content: iniFileContent,
            },
            images: generatedImages,
        };

    } catch (error) {
        console.error("Error in Gemini service:", error);
        throw error;
    }
};


export const editCodeWithGemini = async (currentCode: string, instruction: string): Promise<string> => {
    try {
        const prompt = `
You are an expert Rusted Warfare modding assistant. The user wants to modify the following .ini code based on their instruction.

**Original Code:**
\`\`\`ini
${currentCode}
\`\`\`

**User's Instruction:**
"${instruction}"

Your task is to return ONLY the complete, modified .ini code. Do not add any explanations, comments, or markdown formatting like \`\`\`ini. Just return the raw text of the full, updated code. Ensure the format is valid Rusted Warfare INI format, using \`key: value\` pairs. Crucially, ensure the 'name' key under the '[core]' section is preserved and remains valid.
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.2,
            }
        });

        return response.text.trim();

    } catch(error) {
        console.error("Error editing code with Gemini:", error);
        throw error;
    }
};

const modNameResponseSchema = {
    type: Type.OBJECT,
    properties: {
        modName: {
            type: Type.STRING,
            description: "The new mod name, in PascalCase. E.g., 'MyAwesomeMod'. No spaces or special characters."
        }
    },
    required: ["modName"]
};

export const generateModName = async (instruction: string, currentName: string): Promise<string> => {
    try {
        const prompt = `
You are an expert Rusted Warfare modding assistant. The user wants to change the name of their mod.

Current mod name: "${currentName}"
User's instruction: "${instruction}"

Your task is to generate a new mod name based on the user's instruction.

**CRITICAL Rules:**
1. The name must be a valid folder name.
2. It must be in PascalCase (e.g., 'MyAwesomeMod', 'MechWarriors'). This means it starts with a capital letter, and contains only letters and numbers.
3. It MUST NOT contain spaces, special characters, or file extensions.

Return a JSON object with the new mod name.
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: modNameResponseSchema,
                temperature: 0.3,
            }
        });

        const jsonString = response.text;
        const parsed = JSON.parse(jsonString);
        const newName = parsed.modName;

        if (!newName || !/^[A-Z][a-zA-Z0-9]*$/.test(newName)) {
            throw new Error("AI generated an invalid mod name format.");
        }

        return newName;

    } catch(error) {
        console.error("Error generating mod name with Gemini:", error);
        if (error instanceof Error && error.message.includes("invalid mod name")) {
            throw error;
        }
        throw new Error("The AI failed to generate a valid name. Please try a different description.");
    }
};
