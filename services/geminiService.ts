
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
                    imageName: { type: Type.STRING, description: "The filename for the image, e.g., 'heavy_tank.png', 'heavy_tank_turret.png'." },
                    prompt: { type: Type.STRING, description: "A visually descriptive prompt to generate this specific sprite." }
                },
                required: ["imageName", "prompt"],
            },
        },
        soundFileNames: {
            type: Type.ARRAY,
            description: "An array of filenames for sound effects created from the provided audio file (e.g., ['heavy_tank_attack.mp3']). ONLY populate this if an audio file was provided in the prompt. Otherwise, it MUST be an empty array or omitted.",
            items: {
                type: Type.STRING
            }
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
            description: "The complete Rusted warfare .ini file content for the unit. The [graphics] section must reference the main sprite using the unit's name, e.g., 'image: [unitName].png'."
        },
    },
    required: ["unitName", "iniFileContent"],
};

/**
 * Uses the AI to validate and correct a generated INI file against Rusted Warfare documentation.
 * @param iniContent The initial INI content to validate.
 * @param existingUnitNames A list of units that can be built.
 * @returns A corrected version of the INI file.
 */
const validateAndCorrectIniWithAI = async (iniContent: string, existingUnitNames: string[] = []): Promise<string> => {
    // FIX: Escaped backticks in the template literal to prevent parsing errors.
    const prompt = `
You are a meticulous Rusted Warfare modding expert acting as a code linter. Your SOLE purpose is to analyze the provided .ini file, find ANY errors, and return a perfectly corrected, complete, and functional version.

**Original Code to Analyze:**
\`\`\`ini
${iniContent}
\`\`\`

**Your Task:**
Review the code above against the Rusted Warfare modding documentation you have memorized. Fix all errors silently and return ONLY the full, corrected INI code. Do not add comments or explanations.

**CRITICAL CHECKLIST (Fix any violations):**

1.  **Section & Key Placement:**
    *   Is every single key in its correct section? (e.g., 'maxHp' in '[core]', 'moveSpeed' in '[movement]', 'turretTurnSpeed' in '[turret_...]', 'techLevel' in '[core]').
    *   Relocate any misplaced keys to their proper sections.

2.  **Data Types:**
    *   Does every key have the correct data type? (e.g., 'price' is a number, 'canAttack' is a boolean, 'mass' is a number).
    *   **CRITICAL:** Keys like 'drawType' in '[projectile_...]' MUST be an integer (e.g., '0'), not a string ('BEAM'). Correct all such data type errors. This is a common crash cause.

3.  **Mandatory Keys & Sections:**
    *   Does the '[core]' section exist?
    *   It MUST have a 'name' key (lowercase_snake_case).
    *   It MUST have the following numeric keys: 'price', 'radius', 'maxHp', 'buildSpeed', 'techLevel'. The game will crash without 'price' and 'radius'.
    *   It MUST have a 'class' key with the exact value 'CustomUnitMetadata'. Any other value is wrong.
    *   Does the '[graphics]' section exist with an 'image' key?
    *   Add any missing but essential sections or keys that a unit of this type would logically need to function (e.g., a unit with a turret needs a '[turret_...]' section and an '[attack]' section).

4.  **Movement Validation:**
    *   In the '[movement]' section, the 'movementType' key MUST be one of these exact values: NONE, LAND, AIR, WATER, HOVER, BUILDING, OVER_CLIFF, OVER_CLIFF_WATER.
    *   Correct any invalid values (e.g., 'OVER_LAND' is invalid).

5.  **Builder Syntax (\`[canBuild_...]\`):**
    *   If the unit is a builder, does it use one or more '[canBuild_...]' sections (e.g., '[canBuild_landUnits]')?
    *   The section name '[build]' is INVALID. If you see it, rename it to a valid '[canBuild_...]' format.
    *   The 'name' key inside '[canBuild_...]' must list valid unit names. The only valid names you can use are: [${existingUnitNames.join(', ') || 'None'}]. Remove any references to units not on this list.

6.  **Formatting:**
    *   Is each section header (e.g., '[core]') on its own line?
    *   Is every 'key: value' pair on its own separate line?
    *   Fix all formatting errors.
    
7.  **Remove Invalid & Correct Common Mistake Keys:**
    *   Scan all sections and remove any keys that are not part of the official Rusted Warfare modding API.
    *   **CRITICAL:** Correct common key and value errors:
        *   In \`[graphics]\`, remove invalid keys like \`frame_width\` or \`frame_height\`. The game only understands \`total_frames\`.
        *   In \`[attack]\`, replace \`attackEnabled: true\` with \`canAttack: true\`. Replace \`attackRange\` with the correct key \`maxAttackRange\`.
    *   **CRITICAL:** A common hallucination is inventing keys like \`is: boss\`, \`is: air\`, or \`is: unique\`. These are invalid. Find and replace them with their correct official counterparts:
        *   If you see \`is: air\`, remove it. Ensure the unit has both \`isAir: true\` (in \`[core]\`) and \`movementType: AIR\` (in \`[movement]\`) if it's supposed to fly.
        *   If you see \`is: unique\`, remove it and add \`buildLimit: 1\` to the \`[core]\` section.
        *   If you see \`is: boss\`, remove it. A "Boss" is a design concept, not a flag. The "Boss" label should only be in text fields like \`displayText\`.
        
8.  **Deprecation Check:**
    *   Find and modernize any deprecated keys.
    *   **CRITICAL:** The old \`action_#_...\` format is obsolete. Convert any such actions into the modern \`[action_NAME]\` section format.
    *   **CRITICAL:** The old \`canBuild_#_name\` format is obsolete. Convert it to the modern \`[canBuild_NAME]\` section format.
    *   Remove deprecated graphics keys like \`teamColorsUseHue\` and replace them with the modern \`teamColoringMode\` key.

Return the complete, corrected INI file content as raw text, without any surrounding text or markdown.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            temperature: 0.0, // Be deterministic for corrections
        }
    });

    return response.text.trim();
};


export const generateUnit = async (userPrompt: string, audio: { dataUrl: string, mimeType: string } | undefined, existingUnitNames: string[] | undefined, autoFix: boolean): Promise<GeneratedUnit | null> => {
    try {
        // FIX: Escaped backticks in the template literal to prevent parsing errors.
        const prompt = `
            You are a world-class game designer and Rusted Warfare modding guru. Your mission is to translate a user's idea into a complete, creative, and flawlessly functional unit package. You have an encyclopedic knowledge of the Rusted Warfare modding API, including advanced features from version 1.15 and later.

            User's request: "${userPrompt}"

            **DESIGN PHILOSOPHY (Apply this thinking):**
            1.  **Creative Interpretation:** Don't just make a basic unit. Think like a game designer. What is this unit's unique role on the battlefield? Can it transform? Does it have a special active ability using \`[action_...]\`? Use custom effects (\`[effect_...]\`), animations (\`[animation_...]\`), and cosmetic parts (\`[arm_#]\`, \`[leg_#]\`) to make it visually interesting and memorable.
            2.  **Game Balance:** A fun unit is a balanced unit. If you give it high damage, consider giving it low health, slow speed, or a high cost. Briefly add comments (using \`#\`) in the .ini file to explain your design choices for complex sections, like \`[action_...]\` or special turrets.
            3.  **Completeness:** The generated unit must be fully functional out-of-the-box. This means all necessary files are described, and the INI code is robust.

            **Audio File Handling (Optional):**
            *   An audio file may be provided with the user's prompt. Your task is to listen to it and decide how to use it for the unit's sounds.
            *   Based on the sound, create one or more descriptive sound effect filenames (e.g., 'laser_fire.mp3', 'engine_hum.mp3').
            *   You MUST list these exact filenames in the 'soundFileNames' JSON array.
            *   In the INI file, you MUST then reference these exact filenames in the appropriate sections (e.g., in '[attack]', add 'attackSound: laser_fire.mp3', or in '[movement]', add 'moveSound: engine_hum.mp3').
            *   The single audio file provided by the user should be creatively repurposed for all the sound effects you define. You are the creative director.

            **Non-Negotiable Rules to Prevent Errors:**

            1.  **Mandatory Sections & Unit Identifier ('unitName'):**
                *   Every unit INI file MUST contain \`[core]\`, \`[graphics]\`, and \`[movement]\` sections. If it attacks, it also needs \`[attack]\`.
                *   Create a unique 'unitName' for the unit (e.g., 'heavy_tank').
                *   It MUST be 'lowercase_snake_case'. No spaces, no capitals. This is used for the folder, .ini file, and the core 'name'.

            2.  **INI File '[core]' Section (ABSOLUTELY CRITICAL):**
                *   This section MUST contain a 'name' key. The value MUST be an **EXACT** match for the 'unitName'.
                *   It MUST contain the key-value pair \`class: CustomUnitMetadata\`. This is mandatory.
                *   It MUST contain these mandatory numeric keys: \`price\`, \`radius\`, \`maxHp\`, \`buildSpeed\`, and \`techLevel\`. The game WILL crash without \`price\` or \`radius\`.
                *   NEVER invent keys that do not exist in the official documentation.

            3.  **INI File Formatting:**
                *   Each section header (e.g., '[core]', '[graphics]') MUST be on its own line.
                *   Underneath a section header, every single 'key: value' pair MUST be on its own separate line.
                *   Do not include markdown like \`\`\`ini in the final code.

            4.  **INI File '[graphics]' and Image Consistency:**
                *   The main sprite for the unit MUST be referenced in the INI file as 'image: [unitName].png'. For example, if 'unitName' is "artillery_mech", the INI **MUST** contain 'image: artillery_mech.png'.
                *   For every image filename you write in the '[graphics]' section (e.g., 'image: artillery_mech.png', 'image_turret: turret.png'), you MUST create a corresponding entry in the 'imagePrompts' JSON array.
                *   The 'imageName' in the JSON MUST be an **EXACT, case-sensitive match** to the filename in the INI. The main sprite's entry in JSON must be '{"imageName": "[unitName].png", ...}'.
                *   **CRITICAL:** If a part is not described, **OMIT** its corresponding image key or use a safe default like \`image_wreak: NONE\` or \`image_shadow: AUTO\` to prevent game errors from referencing non-existent files.
                *   **ERROR CAUSE:** Any mismatch causes the "Could not find image..." error. You are responsible for preventing this.

            5.  **Projectile & Effect Asset Consistency (CRITICAL):**
                *   If you define a projectile ('[projectile_...]') or a custom effect ('[effect_...]') that requires an image file, you are **REQUIRED** to add a corresponding entry for that image file in the 'imagePrompts' JSON array.
                *   **If the user's prompt does not describe a unique visual for a projectile, DO NOT invent one.** Instead, use generic Rusted Warfare projectiles that do not require custom images, configure them to be invisible ('drawType: 0'), or define their appearance using keys like \`drawSize\` and \`lightColor\`. **NEVER** reference an image file for a projectile or effect that you have not also added to 'imagePrompts'.
                *   **ERROR CAUSE:** Referencing a non-existent projectile image is a guaranteed "Could not find image..." crash. You are responsible for preventing this by ensuring perfect consistency between the INI file and the 'imagePrompts' array.

            6.  **Sound File Consistency (CRITICAL):**
                *   **The game engine has NO built-in sound files. You cannot reference generic sounds like 'laser.ogg' or 'explosion.wav'.**
                *   **If NO audio file is provided in the user's prompt, you are STRICTLY PROHIBITED from adding ANY sound-related keys to the INI file (e.g., 'attackSound', 'moveSound', 'deathSound', etc.) and the 'soundFileNames' JSON array MUST be empty or omitted.** This prevents game errors from referencing missing files.
                *   If an audio file IS provided, you MUST use it by populating 'soundFileNames' and adding the corresponding keys (like 'attackSound') to the INI file.

            7.  **Correct Value Types (EXTREMELY CRITICAL):**
                *   Every key MUST have a value of the correct data type as expected by the game engine. Incorrect types are a primary cause of game crashes.
                *   Stats like 'price' and 'maxHp' must be numbers. Flags like 'canAttack' must be booleans ('true' or 'false').
                *   **CRITICAL EXAMPLE:** A common error that crashes the game is using a string for a key that expects an integer. For instance, '[projectile_1]drawType: BEAM' is **WRONG**. The 'drawType' key requires a static integer (e.g., '0' or '1'). As an expert with deep knowledge of the modding docs, you MUST use the correct data types for all keys to prevent these errors.

            8.  **Section and Key Placement (EXTREMELY CRITICAL):**
                *   You have been trained on the complete Rusted Warfare modding documentation. It is absolutely essential that you place each key in its correct section.
                *   For example, 'moveSpeed' belongs in '[movement]', 'maxHp' belongs in '[core]', 'attackRange' belongs in '[attack]', 'turretTurnSpeed' belongs in '[turret_...]', and 'turnSpeed' belongs in '[core]'.
                *   Misplacing a key in the wrong section will cause it to be ignored by the game engine or cause a crash. You MUST verify that every key is in its documented section.
            
            9.  **Builders and Tech Hierarchy (EXTREMELY CRITICAL):**
                *   To make a unit a builder (e.g., a factory), you MUST use one or more '[canBuild_anyUniqueName]' sections (e.g., '[canBuild_landUnits]'). Rusted Warfare does not have a '[build]' section.
                *   Inside this section, you MUST list units to build using 'name: unit_1, unit_2'.
                *   When referencing units in 'name', you may ONLY use the names of units that have already been created in this mod. A list of available unit names is: [${(existingUnitNames ?? []).join(', ') || 'None'}]. If this list is empty or the user does not specify what to build, you cannot make the unit a builder.
                *   The 'techLevel' key, which defines the tech requirement for a unit to be built, MUST be placed in the '[core]' section of that unit's own INI file. DO NOT place 'techLevel' in a '[canBuild_...]' section.
                
            10. **\`[movement]\` Section \`movementType\` (EXTREMELY CRITICAL):**
                *   The \`movementType\` key in the \`[movement]\` section must be one of the following exact string values: \`NONE\`, \`LAND\`, \`AIR\`, \`WATER\`, \`HOVER\`, \`BUILDING\`, \`OVER_CLIFF\`, \`OVER_CLIFF_WATER\`.
                *   Do not use any other value (e.g., 'OVER_LAND' is invalid). Choosing the correct type based on the unit description is crucial.

            11. **Sprite Style:**
                *   All generated sprites must be **2D pixel art** from a **strict top-down orthographic perspective**. The background must be black or transparent.

            12. **Invalid Key & Section Prevention (EXTREMELY CRITICAL):**
                *   You MUST NOT invent unofficial keys or sections.
                *   Common invented keys like \`is: air\`, \`is: boss\`, or \`is: unique\` are invalid and will crash the game.
                    *   To make a unit fly, you MUST use both \`isAir: true\` (in \`[core]\`) and \`movementType: AIR\` (in \`[movement]\`).
                    *   To make a unit "unique" (limit how many can be built), you MUST use \`buildLimit: 1\` (in \`[core]\`).
                    *   To label a unit as a "Boss", you should add it to its description, for example: \`displayText: My Unit (Boss)\`. Do not use a flag for this.
                *   **NEVER** invent sections. An \`[armour_...]\` section is invalid; for shields, you MUST use \`[shield_...]\` sections.
                *   In \`[graphics]\`, do not invent keys like \`frame_width\` or \`frame_height\`. You must use \`total_frames\`.
                *   In \`[attack]\`, you MUST use \`maxAttackRange\` (not \`attackRange\`) for the attack radius, and \`canAttack: true\` (not \`attackEnabled: true\`).

            13. **Final Verification:**
                *   Before outputting JSON, mentally perform this check:
                    1. Is '[core]' 'name' identical to 'unitName'? Does '[core]' also have all mandatory keys: 'class', 'price', 'radius', 'maxHp', 'buildSpeed', 'techLevel'?
                    2. Is the INI file formatted with correct line breaks?
                    3. Does the INI's 'image' key point to '[unitName].png'?
                    4. Is **every single image file** referenced anywhere in the INI (in '[graphics]', '[projectile_...]', '[effect_...]', etc.) perfectly mirrored by a corresponding 'imageName' in the 'imagePrompts' array?
                    5. Is **every single invented key** like \`is: air\` removed and replaced with its correct, official counterpart? Are all other invalid keys fixed?
                    6. If I added sound keys to the INI, did I also populate 'soundFileNames' and vice-versa? If no audio was provided, are all sound keys and the soundFileNames array omitted?
            
            *   Your adherence to these rules is non-negotiable and directly impacts the mod's ability to load. Failure to comply will result in a poor user experience.

            Now, based on the user's request, generate the JSON object that fulfills all requirements.
        `;

        const contents = (audio) ? {
            parts: [
                { text: prompt },
                { inlineData: { mimeType: audio.mimeType, data: audio.dataUrl.split(',')[1] } }
            ]
        } : prompt;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
                responseMimeType: 'application/json',
                responseSchema: unitGenerationResponseSchema,
                temperature: 0.3,
            }
        });

        const jsonStr = response.text.trim();
        const parsedResponse = JSON.parse(jsonStr) as { unitName: string; iniFileContent: string; imagePrompts: { imageName: string; prompt: string }[]; soundFileNames?: string[] };
        
        if (!parsedResponse.unitName || !parsedResponse.iniFileContent || !parsedResponse.imagePrompts) {
             throw new Error("AI response was missing required fields.");
        }

        const initialIni = parsedResponse.iniFileContent;
        const correctedIni = autoFix 
            ? await validateAndCorrectIniWithAI(initialIni, existingUnitNames) 
            : initialIni;
        
        const imageGenPromises = parsedResponse.imagePrompts.map(p => 
            ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: `2D pixel art, Rusted Warfare game sprite, ${p.prompt}, strict top-down orthographic view, black background`,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/png',
                    aspectRatio: '1:1',
                }
            }).then(res => ({
                name: p.imageName,
                dataUrl: `data:image/png;base64,${res.generatedImages[0].image.imageBytes}`
            }))
        );

        const images = await Promise.all(imageGenPromises);
        
        const sounds = (parsedResponse.soundFileNames && audio) 
            ? parsedResponse.soundFileNames.map(name => ({ name, dataUrl: audio.dataUrl })) 
            : [];

        const finalUnit: GeneratedUnit = {
            id: parsedResponse.unitName + Date.now(),
            unitName: parsedResponse.unitName,
            iniFile: {
                name: `${parsedResponse.unitName}.ini`,
                content: correctedIni,
            },
            images,
            sounds,
        };

        return finalUnit;

    } catch (e: any) {
        console.error('Error generating unit:', e);
        if (e.message.includes('JSON')) {
             throw new Error('The AI returned an invalid JSON response. Please try rephrasing your request.');
        }
        throw e;
    }
};

export const generateUnitFromImage = async (userPrompt: string, base64ImageData: string, mimeType: string, autoFix: boolean): Promise<GeneratedUnit | null> => {
    try {
        const prompt = `
You are a world-class game designer and Rusted Warfare modding guru. A user has provided an image of a unit and a text prompt. Your task is to analyze both and generate a complete, creative, and functional Rusted Warfare .ini file for it. You must also determine a valid 'unitName' that will be used for the file names.

**User's Request:** "${userPrompt}"

**DESIGN PHILOSOPHY (Apply this thinking):**
1.  **Deep Visual Interpretation:** Don't just look at the image; analyze it. Infer the unit's function, armament, and potential special abilities from its visual design. Is it heavily armored? Does it have unique glowing parts that could signify a special weapon? Translate these visual cues into functional .ini code using your expert knowledge.
2.  **Creative Synthesis:** Combine the visual analysis with the user's text prompt. The text provides context and desires for behavior. Weave these requests into the INI file to create a unit that is both visually and functionally coherent.
3.  **Game Balance:** A fun unit is a balanced unit. Based on the unit's appearance and likely power, assign a reasonable cost and stats. If it looks like a glass cannon, reflect that in the INI. Add comments (#) to explain complex design choices.

**INI File Generation Rules (CRITICAL - Adherence is Mandatory to Prevent Game Crashes):**

1.  **Mandatory Sections:** Every unit INI file **MUST** contain \`[core]\`, \`[graphics]\`, and \`[movement]\` sections. If it attacks, it also needs an \`[attack]\` section.

2.  **'[core]' Section (ABSOLUTELY CRITICAL):**
    *   It **MUST** contain a 'name' key. The value **MUST** be an **EXACT** match for the 'unitName' you generate.
    *   It **MUST** contain the key-value pair \`class: CustomUnitMetadata\`. This is mandatory.
    *   It **MUST** contain these mandatory numeric keys: \`price\`, \`radius\`, \`maxHp\`, \`buildSpeed\`, and \`techLevel\`. The game **WILL** crash without \`price\` or \`radius\`.
    *   **NEVER** invent keys that do not exist in the official documentation.

3.  **'[graphics]' Section (ABSOLUTELY CRITICAL):**
    *   The user has provided the main sprite. Your generated INI **MUST** reference it correctly.
    *   It **MUST** contain the key \`image: [your_generated_unitName].png\`.
    *   For other graphical parts (turrets, effects), if they are not visible in the provided image, **OMIT** the corresponding image keys (e.g., \`image_turret\`) or use a safe default like \`image_wreak: NONE\` or \`image_shadow: AUTO\`. **DO NOT** invent image filenames.

4.  **Formatting:**
    *   Each section header (e.g., '[core]') **MUST** be on its own line.
    *   Every single 'key: value' pair **MUST** be on its own separate line.
    *   Do not include markdown like \`\`\`ini in the final code.

5.  **Data Types (EXTREMELY CRITICAL):**
    *   Every key **MUST** have a value of the correct data type. Incorrect types are a primary cause of game crashes.
    *   Stats like 'price' and 'maxHp' must be numbers. Flags like 'canAttack' must be booleans ('true' or 'false').
    *   For example, '[projectile_1]drawType: BEAM' is **WRONG**. The 'drawType' key requires a static integer (e.g., '0' or '1'). Use the correct data types for all keys.

6.  **Section and Key Placement (EXTREMELY CRITICAL):**
    *   Place each key in its correct section. Misplacing a key will cause it to be ignored or cause a crash.
    *   'moveSpeed' is in \`[movement]\`. 'maxHp' is in \`[core]\`. 'attackRange' is in \`[attack]\`. 'turretTurnSpeed' is in \`[turret_...]\`.

7.  **\`[movement]\` Section \`movementType\` (EXTREMELY CRITICAL):**
    *   The \`movementType\` key **MUST** be one of these exact values: \`NONE\`, \`LAND\`, \`AIR\`, \`WATER\`, \`HOVER\`, \`BUILDING\`, \`OVER_CLIFF\`, \`OVER_CLIFF_WATER\`.
    *   Choose the correct type based on the unit's appearance.

8.  **Sound Files (EXTREMELY CRITICAL):**
    *   Since no audio file was provided with the image, you are **STRICTLY PROHIBITED** from adding **ANY** sound-related keys to the INI file (e.g., 'attackSound', 'moveSound', 'deathSound', etc.). This prevents game errors from referencing missing files.

9.  **Invalid Key & Section Prevention (EXTREMELY CRITICAL):**
    *   You **MUST NOT** invent unofficial keys or sections.
    *   Common invented keys like \`is: air\`, \`is: boss\`, or \`is: unique\` are invalid and will crash the game.
        *   To make a unit fly, you **MUST** use both \`isAir: true\` (in \`[core]\`) and \`movementType: AIR\` (in \`[movement]\`).
        *   To make a unit "unique" (limit how many can be built), you **MUST** use \`buildLimit: 1\` (in \`[core]\`).
        *   To label a unit as a "Boss", you should add it to its description, for example: \`displayText: My Unit (Boss)\`. Do not use a flag for this.
    *   **NEVER** invent sections. An \`[armour_...]\` section is invalid; for shields, you **MUST** use \`[shield_...]\` sections.
    *   In \`[graphics]\`, do not invent keys like \`frame_width\` or \`frame_height\`. You must use \`total_frames\`.
    *   In \`[attack]\`, you **MUST** use \`maxAttackRange\` (not \`attackRange\`) for the attack radius, and \`canAttack: true\` (not \`attackEnabled: true\`).

Return ONLY the JSON object conforming to the schema.
`;

        const imagePart = {
            inlineData: {
                mimeType,
                data: base64ImageData,
            },
        };

        const textPart = { text: prompt };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: unitGenerationFromImageResponseSchema,
                temperature: 0.3,
            }
        });

        const jsonStr = response.text.trim();
        const parsedResponse = JSON.parse(jsonStr) as { unitName: string; iniFileContent: string; };

        if (!parsedResponse.unitName || !parsedResponse.iniFileContent) {
            throw new Error("AI response was missing required fields.");
        }
        
        const initialIni = parsedResponse.iniFileContent;
        const correctedIni = autoFix 
            ? await validateAndCorrectIniWithAI(initialIni) 
            : initialIni;

        const finalUnit: GeneratedUnit = {
            id: parsedResponse.unitName + Date.now(),
            unitName: parsedResponse.unitName,
            iniFile: {
                name: `${parsedResponse.unitName}.ini`,
                content: correctedIni,
            },
            images: [{
                name: `${parsedResponse.unitName}.png`,
                dataUrl: `data:${mimeType};base64,${base64ImageData}`,
            }],
        };

        return finalUnit;

    } catch (e: any) {
        console.error('Error generating unit from image:', e);
        if (e.message.includes('JSON')) {
            throw new Error('The AI returned an invalid JSON response. Please try rephrasing your request.');
        }
        throw e;
    }
};

export const editCodeWithGemini = async (currentCode: string, instruction: string, existingUnitNames: string[] | undefined, autoFix: boolean): Promise<string> => {
    // FIX: Escaped backticks in the template literal to prevent parsing errors.
    const prompt = `
You are a Rusted Warfare modding expert. A user wants to modify an existing .ini file.
Your task is to apply the user's requested changes while ensuring the resulting code is valid and adheres to all modding best practices.

**Current Code:**
\`\`\`ini
${currentCode}
\`\`\`

**User's Edit Instruction:** "${instruction}"

**Your Task:**
1.  Analyze the user's instruction and the current code.
2.  Generate a new version of the INI file that incorporates the changes.
3.  Ensure your output is ONLY the raw, complete, and updated INI file content. Do not include explanations, comments, or markdown.
4.  After making the changes, perform a final critical validation. Ensure all keys are in the correct sections, data types are correct, and mandatory sections/keys are present.
5.  **CRITICAL:** You must find and fix all common "hallucination" errors. This includes:
    *   Replacing invented keys like \`is: boss\`, \`is: air\`, or \`is: unique\` with their official counterparts (\`displayText\`, \`isAir: true\`, \`buildLimit: 1\`).
    *   Replacing invented sections like \`[armour_...]\` with valid ones like \`[shield_...]\`.
    *   In \`[graphics]\`, removing invalid keys like \`frame_width\` and using \`total_frames\`.
    *   In \`[attack]\`, using the correct keys \`maxAttackRange\` (not \`attackRange\`) and \`canAttack: true\` (not \`attackEnabled: true\`).
    *   The only valid buildable units are: [${(existingUnitNames ?? []).join(', ') || 'None'}].

Return only the raw INI code.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            temperature: 0.2,
        }
    });

    const editedIni = response.text.trim();
    // Now validate and correct the edited code
    const correctedIni = autoFix
        ? await validateAndCorrectIniWithAI(editedIni, existingUnitNames)
        : editedIni;

    return correctedIni;
};

export const generateModName = async (prompt: string, currentName: string): Promise<string> => {
    const fullPrompt = `The user wants to rename their Rusted Warfare mod.
Current name: "${currentName}"
User's suggestion: "${prompt}"

Generate a new, creative mod name based on the user's suggestion. The name should be a valid folder name (PascalCase or snake_case, no spaces or special characters). Return ONLY the new name as a single string.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: {
            temperature: 0.7,
            stopSequences: ['\n'],
        }
    });

    return response.text.trim().replace(/[^a-zA-Z0-9_]/g, ''); // Sanitize
};
