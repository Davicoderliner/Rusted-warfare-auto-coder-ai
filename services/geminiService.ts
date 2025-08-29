
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
            description: "The complete Rusted warfare .ini file content for the unit."
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

const unitGenerationFromImageResponseSchema = {
    type: Type.OBJECT,
    properties: {
        unitName: {
            type: Type.STRING,
            description: "The unique identifier for the unit (e.g., 'heavy_tank') based on the provided image. MUST be lowercase_snake_case. This is used for the folder, .ini filename, and the 'name' key in the [core] section."
        },
        iniFileContent: {
            type: Type.STRING,
            description: "The complete Rusted warfare .ini file content for the unit. The [graphics] section must reference 'image: image.png' as the main sprite, as it is provided by the user."
        },
    },
    required: ["unitName", "iniFileContent"],
};


export const generateUnit = async (userPrompt: string): Promise<GeneratedUnit | null> => {
    try {
        const prompt = `
            You are an expert Rusted Warfare modding assistant. You have been provided with an exhaustive reference document and several advanced examples for the Rusted Warfare modding API. Your task is to use this deep knowledge to generate a complete, creative, and functional unit package that is GUARANTEED to load without errors.

            User's request: "${userPrompt}"

            **Leverage Comprehensive Modding Knowledge:**
            You have detailed information on all INI sections. Use this knowledge to go beyond basic units and create something that feels unique and expertly crafted based on the user's prompt.

            **Advanced Techniques Learned from Examples:**
            - **Transformations & States:** Units can have multiple states (e.g., flying, submerged). These are handled with \`[action_...]\` sections using \`convertTo: new_unit_name\`. The different states are defined in separate .ini files (\`new_unit_name.ini\`).
            - **Inheritance:** Secondary state files (\`_underwater.ini\`, \`_transition.ini\`) can use \`copyFrom: base_unit.ini\` to inherit all properties from a base unit and only override what's necessary, like \`[movement]\` or \`[attack]\` sections.
            - **Animations:** Use \`[animation_NAME]\` sections to define complex movements for cosmetic parts during actions (like diving or surfacing). Link these to actions using \`whenBuilding_playAnimation: NAME\`.
            - **Cosmetic Parts:** Use \`[arm_#]\` and \`[leg_#]\` to attach non-functional, animated parts to a unit for visual appeal.
            - **Complex Projectiles:** Projectiles can be highly customized with effects (\`lightingEffect\`), custom hit effects (\`explodeEffect:CUSTOM:...\`), and specific damage multipliers (\`shieldDamageMultiplier\`, \`buildingDamageMultiplier\`).
            - **Custom Effects:** Define visual effects using \`[effect_NAME]\` sections to create unique visuals for weapons, movement, and explosions.

            **Task Application:**
            While your current task is to generate a single unit package (one primary .ini file and its assets), you MUST use this advanced knowledge to make your generated units far more interesting and complex. For example:
            - If a user asks for a versatile unit, add an \`[action_...]\` even if it doesn't \`convertTo\` another unit; maybe it provides a temporary boost or changes weapon state.
            - Add \`[arm_#]\` parts to mechs and jets to make them visually dynamic.
            - Create detailed custom projectiles and effects instead of using simple \`directDamage\`.
            - The goal is to produce a mod file that feels expertly crafted and uses the full potential of the modding engine.

            **Non-Negotiable Rules to Prevent Errors:**

            1.  **Unit Identifier (\`unitName\`):**
                *   Create a unique \`unitName\` for the unit (e.g., 'heavy_tank').
                *   It MUST be \`lowercase_snake_case\`. No spaces, no capitals. This is used for the folder, .ini file, and the core \`name\`.

            2.  **INI File \`[core]\` Section:**
                *   This section MUST contain a \`name\` key.
                *   The value of this \`name\` key MUST be an **EXACT** match for the \`unitName\` from step 1.
                *   **EXAMPLE:** If \`unitName\` is "artillery_mech", the INI file **MUST** contain \`name: artillery_mech\` under \`[core]\`.
                *   **ERROR CAUSE:** Failing this rule causes the "Could not find name..." error. You are responsible for preventing this.

            3.  **INI File \`[graphics]\` and Image Consistency:**
                *   For every image filename you write in the \`[graphics]\` section (e.g., \`image: base.png\`), you MUST create a corresponding entry in the \`imagePrompts\` JSON array.
                *   The \`imageName\` in the JSON MUST be an **EXACT, case-sensitive match** to the filename in the INI.
                *   **EXAMPLE:** If INI has \`image_turret: turret_heavy.png\`, JSON must have \`{ "imageName": "turret_heavy.png", ... }\`.
                *   **ERROR CAUSE:** Any mismatch causes the "Could not find image..." error. You are responsible for preventing this.

            4.  **Sprite Style:**
                *   All generated sprites must be **2D pixel art** from a **strict top-down orthographic perspective**. The background must be black or transparent.

            5.  **Final Verification:**
                *   Before outputting JSON, mentally perform this check:
                    1. Is \`[core]\` \`name\` identical to \`unitName\`?
                    2. Is every image file in \`[graphics]\` perfectly mirrored by an \`imageName\` in \`imagePrompts\`?
                *   Your output must be a single, minified JSON object matching the required schema. No extra text or markdown.
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

export const generateUnitFromImage = async (userPrompt: string, imageBase64: string, mimeType: string): Promise<GeneratedUnit | null> => {
    try {
        const imagePart = {
            inlineData: {
                mimeType,
                data: imageBase64,
            },
        };

        const textPart = {
            text: `
You are an expert Rusted Warfare modding assistant. You have been provided with an image of a unit and a user request. Your task is to analyze the image and generate a complete, creative, and functional INI file for a unit based on that image.

User's request: "${userPrompt || 'Create a unit based on the image.'}"

**Analysis of the Provided Image:**
- Identify the unit type (e.g., tank, mech, aircraft, ship).
- Observe its features: weapons, armor, size, technology level, and overall design.
- Use these visual cues to determine appropriate stats, weapons, and abilities in the .ini file. The generated stats should logically match the unit's appearance.

**Non-Negotiable Rules to Prevent Errors:**

1.  **Unit Identifier (\`unitName\`):**
    *   Create a descriptive \`unitName\` for the unit based on the image (e.g., 'quad_cannon_tank').
    *   It MUST be \`lowercase_snake_case\`. No spaces, no capitals. This is critical for game loading.

2.  **INI File \`[core]\` Section:**
    *   This section MUST contain a \`name\` key.
    *   The value of this \`name\` key MUST be an **EXACT** match for the \`unitName\` from rule 1.
    *   **ERROR CAUSE:** A mismatch causes the "Could not find name..." error. You must prevent this.

3.  **INI File \`[graphics]\` Section:**
    *   The user has provided the main sprite. This file will be named \`image.png\`.
    *   You MUST include the line \`image: image.png\` in the \`[graphics]\` section.
    *   You MUST NOT define any other images (like \`image_turret\`, \`image_wreak\`, etc.). Only use the single provided image.

4.  **Final Verification:**
    *   Before outputting JSON, mentally perform this check:
        1. Is \`[core]\` \`name\` identical to \`unitName\`?
        2. Does \`[graphics]\` contain exactly \`image: image.png\` and no other image definitions?
    *   Your output must be a single, minified JSON object matching the required schema. No extra text or markdown.
        `
        };

        const codeGenResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [textPart, imagePart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: unitGenerationFromImageResponseSchema,
                temperature: 0.5,
            }
        });

        const jsonString = codeGenResponse.text;
        const parsedResponse = JSON.parse(jsonString);

        if (!parsedResponse.unitName || !parsedResponse.iniFileContent) {
            throw new Error("AI response was missing required fields for image-based unit generation.");
        }

        const { unitName, iniFileContent } = parsedResponse;

        // The image is provided by the user, so we don't generate any.
        const userImage = {
            name: 'image.png',
            dataUrl: `data:${mimeType};base64,${imageBase64}`
        };

        return {
            id: Date.now().toString(),
            unitName: unitName,
            iniFile: {
                name: `${unitName}.ini`,
                content: iniFileContent,
            },
            images: [userImage],
        };

    } catch (error) {
        console.error("Error in Gemini service (from image):", error);
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
