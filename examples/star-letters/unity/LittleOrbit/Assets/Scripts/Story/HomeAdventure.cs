using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;

namespace StarLetters
{
    [RequireComponent(typeof(CharacterController))]
    public sealed class HomeAdventure : MonoBehaviour
    {
        public Camera viewCamera;
        public Transform avatar;
        public Transform leftLeg, rightLeg;
        public Light beaconLight;
        public Renderer beaconCrystal;
        public HomeInteraction[] interactions;
        public Vector3 spawn;
        public float walkSpeed = 3.2f;
        public CampaignDirector campaign;
        public HomeQuest Quest { get; private set; } = new HomeQuest();
        public bool DialogueOpen => message != null;

        CharacterController controller;
        HomeInteraction nearest;
        string message;
        float fallSpeed, gait, yaw = 35f, distance = 19f;
        Material crystalMaterial;
        Font uiFont;
        GUIStyle heading, body, small, button;
        Vector3 cameraFocus;
        float walkYaw = 20f, walkPitch = 12f, walkDistance = 4.8f, cameraBoom = 4.8f;
        bool overview, cameraNeedsSnap = true, wasCloseCamera;
        readonly RaycastHit[] cameraHits = new RaycastHit[64];
        Skybox homeSkybox;
        Renderer[] avatarRenderers;
        ShadowCastingMode[] avatarShadowModes;
        bool avatarHidden;
        public bool CloseCamera => !overview;
        readonly string[] goals = {
            "看看信箱里的来信", "去花圃照看那朵花", "从工具箱取出备用零件",
            "修好出发的信标", "邻星的航路已经亮起"
        };

        void Awake()
        {
            controller = GetComponent<CharacterController>();
            avatarRenderers = avatar.GetComponentsInChildren<Renderer>(true);
            avatarShadowModes = new ShadowCastingMode[avatarRenderers.Length];
            for (int i=0;i<avatarRenderers.Length;i++) avatarShadowModes[i]=avatarRenderers[i].shadowCastingMode;
            cameraFocus = transform.position * .3f;
            // A bundled OFL font subset supports Chinese in both editor and Web.
            uiFont = Resources.Load<Font>("Fonts/StarLettersUI");
            if (uiFont == null) Debug.LogError("Missing bundled StarLettersUI font. Run scripts/subset-story-font.py.");
            if (beaconCrystal != null) crystalMaterial = beaconCrystal.material;
            RefreshBeacon();
            FindNearest();
        }

        void Update()
        {
            if (!Application.isFocused) return;
            var keyboard = Keyboard.current;
            float dt = Mathf.Min(Time.deltaTime, .05f);
            if(campaign!=null && campaign.IsBlockingInput)return;
            if (message != null)
            {
                if (keyboard != null && (keyboard.escapeKey.wasPressedThisFrame || keyboard.enterKey.wasPressedThisFrame))
                    message = null;
                return;
            }
            Vector2 input = Vector2.zero;
            if (keyboard != null)
            {
                input.x = (keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed ? 1 : 0) -
                          (keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed ? 1 : 0);
                input.y = (keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed ? 1 : 0) -
                          (keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed ? 1 : 0);
            }
            var forward = Vector3.ProjectOnPlane(viewCamera.transform.forward, Vector3.up).normalized;
            var right = Vector3.ProjectOnPlane(viewCamera.transform.right, Vector3.up).normalized;
            Vector3 direction = Vector3.ClampMagnitude(forward * input.y + right * input.x, 1);
            float speed = walkSpeed * (keyboard != null && keyboard.leftShiftKey.isPressed ? 1.45f : 1);
            Vector3 move = direction * speed * dt;
            // A soft, bounded top surface keeps the first prototype out of global-gravity complexity.
            Vector3 candidate = transform.position + move;
            if (new Vector2(candidate.x, candidate.z).magnitude > 7.85f) move = Vector3.zero;
            fallSpeed = controller.isGrounded ? -1f : Mathf.Max(fallSpeed - 18f * dt, -25f);
            controller.Move(move + Vector3.up * fallSpeed * dt);
            if (transform.position.y < -2f) TeleportTo(spawn);
            if (direction.sqrMagnitude > .01f && move.sqrMagnitude > .0001f)
            {
                avatar.rotation = Quaternion.Slerp(avatar.rotation, Quaternion.LookRotation(direction), 12f * dt);
                gait += speed * dt * 3;
            }
            float step = direction.sqrMagnitude > .01f ? Mathf.Sin(gait) * 24 : 0;
            if (leftLeg != null) leftLeg.localRotation = Quaternion.Euler(step, 0, 0);
            if (rightLeg != null) rightLeg.localRotation = Quaternion.Euler(-step, 0, 0);
            if(campaign==null)
            {
                FindNearest();
                if (keyboard != null && keyboard.eKey.wasPressedThisFrame && nearest != null) Interact(nearest);
            }
        }

        void LateUpdate()
        {
            if (viewCamera == null) return;
            var mouse = Mouse.current;
            var keyboard = Keyboard.current;
            // All worlds share the authored sky. GardenPresentation owns its
            // seasonal copy, so returning home cannot retain a winter override.
            if (homeSkybox == null) homeSkybox = viewCamera.GetComponent<Skybox>();
            if (homeSkybox != null) homeSkybox.enabled = false;
            bool inputAllowed = message == null && (campaign==null || !campaign.IsBlockingInput) && Application.isFocused;
            if (inputAllowed && keyboard != null)
            {
                if (keyboard.vKey.wasPressedThisFrame) { overview = !overview; cameraNeedsSnap = true; }
                if (keyboard.cKey.wasPressedThisFrame)
                ResetWalkingCamera(campaign == null || campaign.Progress == null ? StoryWorld.Home : campaign.Progress.world);
            }
            bool close = !overview;
            if (close != wasCloseCamera) cameraNeedsSnap = true;
            wasCloseCamera = close;
            float dt = Mathf.Min(Time.deltaTime, .05f);
            if (close)
            {
                if (inputAllowed)
                {
                    if (mouse != null)
                    {
                        if (mouse.rightButton.isPressed)
                        {
                            walkYaw += mouse.delta.ReadValue().x * .16f;
                            walkPitch = Mathf.Clamp(walkPitch - mouse.delta.ReadValue().y * .12f, -25f, 60f);
                        }
                        // Web wheel steps can be much smaller than desktop's 120-unit steps.
                        // Bound each frame so both mouse notches and trackpad gestures stay controllable.
                        float zoomStep = Mathf.Clamp(mouse.scroll.ReadValue().y * .35f, -.8f, .8f);
                        walkDistance = Mathf.Clamp(walkDistance - zoomStep, 3.2f, 11f);
                    }
                    if (keyboard != null)
                    {
                        walkYaw += ((keyboard.rKey.isPressed ? 1 : 0) - (keyboard.qKey.isPressed ? 1 : 0)) * 70f * dt;
                        walkPitch = Mathf.Clamp(walkPitch + ((keyboard.kKey.isPressed ? 1 : 0) - (keyboard.iKey.isPressed ? 1 : 0)) * 55f * dt,-25f,60f);
                    }
                }
                var focus = transform.position + Vector3.up * 1.15f;
                // Raise the target while looking upward so the unobstructed
                // camera stays at eye height instead of dropping into the grass.
                // The same raised target is used for the collision sweep.
                focus.y += Mathf.Max(0,-Mathf.Sin(walkPitch*Mathf.Deg2Rad))*walkDistance;
                cameraFocus = cameraNeedsSnap ? focus : Vector3.Lerp(cameraFocus, focus, 1 - Mathf.Exp(-12f * dt));
                float azimuth = walkYaw * Mathf.Deg2Rad, elevation = walkPitch * Mathf.Deg2Rad;
                Vector3 boom = new Vector3(Mathf.Sin(azimuth)*Mathf.Cos(elevation), Mathf.Sin(elevation), Mathf.Cos(azimuth)*Mathf.Cos(elevation));
                float safeDistance = walkDistance;
                int hits = Physics.SphereCastNonAlloc(cameraFocus, .22f, boom, cameraHits, walkDistance, ~0, QueryTriggerInteraction.Ignore);
                for (int i = 0; i < hits; i++)
                {
                    var hit = cameraHits[i];
                    if (hit.collider.transform.IsChildOf(transform)) continue;
                    safeDistance = Mathf.Min(safeDistance, Mathf.Max(.35f, hit.distance - .12f));
                }
                // Pull in immediately at walls; ease out once the view clears.
                cameraBoom = cameraNeedsSnap || safeDistance < cameraBoom ? safeDistance : Mathf.Lerp(cameraBoom, safeDistance, 1 - Mathf.Exp(-5f * dt));
                viewCamera.fieldOfView = viewCamera.aspect < 1.3f
                    ? Mathf.Min(85f, 2f * Mathf.Atan(Mathf.Tan(28f*Mathf.Deg2Rad)*1.3f/viewCamera.aspect)*Mathf.Rad2Deg)
                    : 56f;
                viewCamera.nearClipPlane = .08f;
                viewCamera.transform.position = cameraFocus + boom * cameraBoom;
            }
            else
            {
                if (inputAllowed)
                {
                    if (mouse != null)
                    {
                        if (mouse.rightButton.isPressed) yaw += mouse.delta.ReadValue().x * .18f;
                        distance = Mathf.Clamp(distance - Mathf.Clamp(mouse.scroll.ReadValue().y * .35f,-.8f,.8f),13f,24f);
                    }
                    if (keyboard != null)
                        yaw += ((keyboard.rKey.isPressed ? 1 : 0) - (keyboard.qKey.isPressed ? 1 : 0)) * 70f * dt;
                }
                var focus = transform.position * .30f + Vector3.up * .6f;
                cameraFocus = cameraNeedsSnap ? focus : Vector3.Lerp(cameraFocus, focus, 1 - Mathf.Exp(-5f * dt));
                float angle = yaw * Mathf.Deg2Rad;
                viewCamera.fieldOfView = 43f;
                viewCamera.transform.position = cameraFocus + new Vector3(Mathf.Sin(angle) * distance, distance * .82f, Mathf.Cos(angle) * distance);
            }
            viewCamera.transform.LookAt(cameraFocus);
            // A wall may compress the camera inside the traveller. Keep the
            // ground shadow but remove the body from that obstructed view.
            // Separate enter/exit distances avoid flicker along wall edges.
            float avatarDistance=Vector3.Distance(viewCamera.transform.position,transform.position+Vector3.up*1.15f);
            SetAvatarHidden(close && avatarDistance<(avatarHidden?1.5f:1.2f));
            cameraNeedsSnap = false;
        }

        void SetAvatarHidden(bool hidden)
        {
            if(avatarHidden==hidden || avatarRenderers==null)return;
            avatarHidden=hidden;
            for(int i=0;i<avatarRenderers.Length;i++)
                if(avatarRenderers[i]!=null)
                    avatarRenderers[i].shadowCastingMode=hidden?ShadowCastingMode.ShadowsOnly:avatarShadowModes[i];
        }

        void OnDisable() => SetAvatarHidden(false);

        void FindNearest()
        {
            nearest = null;
            float best = float.PositiveInfinity;
            foreach (var item in interactions)
            {
                float d = Vector3.Distance(transform.position, item.transform.position);
                if (d <= item.radius && d < best) { best = d; nearest = item; }
            }
        }

        public bool Interact(HomeInteraction item)
        {
            if (item == null || message != null || Vector3.Distance(transform.position, item.transform.position) > item.radius)
                return false;
            bool advanced = Quest.Apply(item.action);
            if (!advanced)
            {
                message = item.action == HomeAction.Beacon && Quest.Stage == HomeStage.Ready
                    ? "灯已经亮了，风铃匠与种植者的星球就在远方。\n\n家园开场到这里结束。邻星将在下一阶段接入。"
                    : "先完成眼前的事情吧。\n\n" + goals[(int)Quest.Stage];
            }
            else switch (item.action)
            {
                case HomeAction.Mailbox:
                    message = "你好。\n\n听说你的星球上开了一朵花。\n请告诉我，你是怎么做到的？\n我已经把春天需要的一切都买齐了。\n\n—— 一位等待春天的园丁\n\n信封背面画着一座花园，还有两张空椅子。";
                    break;
                case HomeAction.Flower:
                    message = "你扶正了花枝，松了松土。\n\n阳光、雨水、风，还有每天的一点照顾……\n该怎么把这些写进回信里呢？\n\n先修好信标，去邻星问问朋友吧。备用零件就在小屋旁的工具箱里。";
                    break;
                case HomeAction.Toolbox:
                    message = "找到了一枚备用接头。\n\n把它装回信标，离开家园的路就会重新亮起。";
                    break;
                case HomeAction.Beacon:
                    message = "黄铜灯架里亮起了一点暖光。\n\n远处的星球也回应了你。\n风铃匠和种植者，也许认识那位园丁。\n\n家园开场已完成。你可以继续散步，或重新体验这一段。";
                    break;
            }
            RefreshBeacon();
            return advanced;
        }

        void RefreshBeacon()
        {
            bool lit = Quest.Stage == HomeStage.Ready;
            if (beaconLight != null) beaconLight.enabled = lit;
            if (crystalMaterial != null)
            {
                crystalMaterial.SetColor("_BaseColor", lit ? new Color(1, .65f, .18f) : new Color(.22f,.32f,.35f));
                crystalMaterial.EnableKeyword("_EMISSION");
                crystalMaterial.SetColor("_EmissionColor", lit ? new Color(1,.5f,.1f)*2 : Color.black);
            }
        }

        public void Restart()
        {
            Quest.Reset(); message = null; fallSpeed = 0; gait = 0;
            TeleportTo(spawn); RefreshBeacon(); FindNearest();
        }
        public void CloseDialogue() => message = null;
        public void ResetWalkingCamera(StoryWorld world)
        {
            overview = false;
            walkYaw = world == StoryWorld.Home ? 20f : 0f;
            walkPitch = world == StoryWorld.Home ? 12f : world == StoryWorld.Garden ? 14f : 18f;
            walkDistance = world == StoryWorld.Home ? 4.8f : world == StoryWorld.Garden ? 6.3f : 6.8f;
            cameraNeedsSnap = true;
        }
        public void TeleportTo(Vector3 position)
        {
            controller.enabled = false;
            transform.position = position;
            controller.enabled = true;
            cameraNeedsSnap = true;
        }

        void Styles()
        {
            if (heading != null) return;
            heading = new GUIStyle(GUI.skin.label) { font = uiFont, fontSize = 28, wordWrap = true };
            body = new GUIStyle(GUI.skin.label) { font = uiFont, fontSize = 20, wordWrap = true };
            small = new GUIStyle(body) { fontSize = 16 };
            button = new GUIStyle(GUI.skin.button) { font = uiFont, fontSize = 18 };
        }

        void OnGUI()
        {
            if(campaign!=null)return;
            Styles();
            var previous = GUI.matrix;
            float scale = Mathf.Min(Screen.width / 1280f, Screen.height / 720f);
            GUI.matrix = Matrix4x4.TRS(new Vector3((Screen.width-1280*scale)/2, (Screen.height-720*scale)/2,0), Quaternion.identity, Vector3.one*scale);
            Panel(new Rect(22,22,440,118));
            GUI.Label(new Rect(40,30,400,40), "星野来信 · 迟到的春天", heading);
            GUI.Label(new Rect(40,79,405,50), goals[(int)Quest.Stage], body);
            GUI.Label(new Rect(26,666,1000,40), "WASD / 方向键移动    Shift 跑步    E 互动    右键拖动镜头    滚轮缩放", small);
            if (message == null && GUI.Button(new Rect(1110,26,145,42), "重新开始", button)) Restart();
            if (message == null && nearest != null && GUI.Button(new Rect(470,605,340,50), "E · " + nearest.displayName, button)) Interact(nearest);
            if (message != null)
            {
                Panel(new Rect(315,155,650,445));
                GUI.Label(new Rect(345,178,590,340), message, body);
                if (GUI.Button(new Rect(745,535,185,42), "继续 · Enter", button)) message = null;
            }
            GUI.matrix = previous;
        }

        static void Panel(Rect bounds)
        {
            Color previous = GUI.color;
            GUI.color = new Color(.12f,.16f,.22f,.97f);
            GUI.DrawTexture(bounds, Texture2D.whiteTexture);
            GUI.color = previous;
        }

        void OnDestroy()
        {
            if (crystalMaterial != null) Destroy(crystalMaterial);
        }
    }
}
