"""Small original meshes shared by the home art generator.

Coordinates are Blender Z-up. Functions return vertices and polygon indices;
they do not require Blender or modify files. Front-facing panels face -Y.
"""
import math


def extruded_outline(outline, front, depth):
    """Extrude a counterclockwise X/Z outline toward +Y, with outward normals."""
    count = len(outline)
    vertices = [(x, y, z) for y in (front, front + depth) for x, z in outline]
    faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((j, i, i + count, j + count))
    return vertices, faces


def arched_panel(center, front, base, radius, spring, depth, clip=None):
    """Closed arched panel, optionally restricted to one vertical door plank."""
    left, right = clip if clip else (center - radius, center + radius)
    left, right = max(left, center - radius), min(right, center + radius)
    if not left < right or base >= spring or depth <= 0:
        raise ValueError('Arched panel must have positive area and depth')
    # Sample in angle space so the rounded shoulders have no coarse corners.
    start = math.acos(max(-1, min(1, (right - center) / radius)))
    end = math.acos(max(-1, min(1, (left - center) / radius)))
    steps = max(2, math.ceil((end - start) / (math.pi / 24)))
    outline = [(left, base), (right, base)]
    for i in range(steps + 1):
        angle = start + (end - start) * i / steps
        outline.append((center + radius * math.cos(angle), spring + radius * math.sin(angle)))
    return extruded_outline(outline, front, depth)


def arch_stone(center, front, spring, inner, outer, start, end, depth):
    """One tapered voussoir, keeping the door surround visibly segmented."""
    outline = [(center + radius * math.cos(angle), spring + radius * math.sin(angle))
               for radius, angle in ((inner, start), (outer, start), (outer, end), (inner, end))]
    return extruded_outline(outline, front, depth)


def turned_profile(x, y, base, profile, segments=16):
    """Revolve an outside-to-inside profile; pot rim and inner wall stay visible.

    The profile starts and ends on the axis. Axis rings use single vertices to
    avoid degenerate triangles. All faces are outward from the solid material.
    """
    vertices, bands, faces = [], [], []
    for radius, z in profile:
        if radius == 0:
            bands.append([len(vertices)])
            vertices.append((x, y, base + z))
        else:
            bands.append(list(range(len(vertices), len(vertices) + segments)))
            vertices.extend((x + radius * math.cos(i * math.tau / segments),
                             y + radius * math.sin(i * math.tau / segments), base + z)
                            for i in range(segments))
    for lower, upper in zip(bands, bands[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            if len(lower) == 1:
                faces.append((lower[0], upper[j], upper[i]))
            elif len(upper) == 1:
                faces.append((lower[i], lower[j], upper[0]))
            else:
                faces.append((lower[i], lower[j], upper[j], upper[i]))
    return vertices, faces


def folded_leaf(center, direction, length, width, roll=0):
    """A closed narrow leaf with a raised midrib, rolled around its own stem.

    Eight triangles give both sides correct normals without coplanar duplicate
    faces. Varying roll breaks the horizontal stacked-card look of old leaves.
    """
    magnitude = math.sqrt(sum(c*c for c in direction))
    along = tuple(c / magnitude for c in direction)
    reference = (0, 0, 1) if abs(along[2]) < .95 else (0, 1, 0)
    def cross(a, b):
        return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
    across = cross(reference, along)
    scale = math.sqrt(sum(c*c for c in across))
    across = tuple(c / scale for c in across)
    normal = cross(along, across)
    rotated = tuple(across[i]*math.cos(roll) + normal[i]*math.sin(roll) for i in range(3))
    normal = cross(along, rotated)
    def vertex(a, b, c):
        return tuple(center[i] + along[i]*a + rotated[i]*b + normal[i]*c for i in range(3))
    vertices = [vertex(-length, 0, 0), vertex(0, -width, 0),
                vertex(length, 0, 0), vertex(0, width, 0),
                vertex(0, 0, length*.16), vertex(0, 0, -length*.04)]
    faces = []
    for i in range(4):
        j = (i + 1) % 4
        faces.extend(((i, j, 4), (j, i, 5)))
    return vertices, faces
