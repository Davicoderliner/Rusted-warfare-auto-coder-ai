
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
            You are an expert Rusted Warfare modding assistant. Your task is to generate a complete unit package based on a user's description.

            User's request: "${userPrompt}"

            **Instructions:**

            1.  **Design the Unit Identifier:**
                *   First, create a unique identifier for this unit. This will be its \`unitName\`.
                *   **CRITICAL:** The \`unitName\` MUST be a single word in \`lowercase_snake_case\`. For example, 'heavy_tank', 'scout_ship', 'artillery_mech'. It must NOT contain spaces or capital letters.
                *   This \`unitName\` will be used for the unit's folder name, its \`.ini\` file name, and its internal \`name\` in the \`[core]\` section.

            2.  **Create the INI File Content:**
                *   Create the complete and valid Rusted Warfare .ini file content.
                *   **CRITICAL:** In the \`[core]\` section, you MUST include a \`name\` key. The value of this key MUST be the exact \`unitName\` you created in step 1. Example: \`name: heavy_tank\`. This is the most important step to prevent game errors.
                *   The format must always use \`key: value\`.
                *   Infer appropriate stats like \`price\`, \`maxHp\`, \`mass\`, \`moveSpeed\`, etc., based on the unit's description.
                *   In the \`[graphics]\` section, define all necessary images. A unit needs at least an \`image\`. If it has turrets, it needs \`image_turret\`. Also consider adding an \`image_wreak\`. The filenames should be simple, like \`image.png\`, \`image_turret.png\`.

            3.  **Create Image Prompts:**
                *   For **each and every** image file referenced in the \`[graphics]\` section of the INI file (e.g., the value for keys like \`image\`, \`image_turret\`, \`image_wreak\`), you MUST create a corresponding entry in the \`imagePrompts\` array.
                *   **CRITICAL - DO NOT FAIL THIS STEP:** The \`imageName\` string in each \`imagePrompts\` object MUST EXACTLY MATCH the filename string you used as a value in the \`[graphics]\` section of the \`iniFileContent\`.
                *   For example, if the INI contains \`image: base.png\` and \`image_turret: turret.png\`, then the \`imagePrompts\` array must contain two objects, one with \`"imageName": "base.png"\` and another with \`"imageName": "turret.png"\`. A mismatch here will cause the mod to fail.
                *   **CRITICAL STYLE:** All prompts MUST generate a **2D pixel art sprite** from a **strict top-down orthographic perspective**. The style must be consistent with a retro RTS game like Rusted Warfare. The background MUST be black or transparent.

            4.  **Final Verification and Formatting:**
                *   Before creating the final JSON, double-check your work. Verify that every image filename listed as a value in the \`[graphics]\` section of your \`iniFileContent\` has an exactly corresponding \`imageName\` in the \`imagePrompts\` array.
                *   Return a single, minified JSON object matching the required schema. The JSON must contain the \`unitName\`, the \`iniFileContent\`, and an array of \`imagePrompts\`. Do not include any other text, explanations, or markdown formatting.
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